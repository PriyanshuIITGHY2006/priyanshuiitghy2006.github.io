## The problem

Assam floods almost every monsoon as the Brahmaputra swells, and the
difference between a managed evacuation and a disaster is often just a few
days of warning. Prag-Dristi predicts how much water the river will carry
over the next **seven days** at three monitoring stations, turned into an
actionable flood signal, trained on 23 years of ERA5 reanalysis and GloFAS
discharge data.

## Architecture — an LSTM encoder–decoder with Bahdanau attention

The encoder reads a 30-day input window and produces a hidden state per
day. A plain sequence-to-sequence model would compress all 30 days into one
fixed vector for the decoder to work from — **Bahdanau attention**
[Bahdanau et al., 2014] instead lets the decoder look back at *every*
encoder day on each future step and learn which ones actually matter, which
is closer to how a hydrologist reasons about upstream rainfall travelling
downstream over several days:

```python
class BahdanauAttention(nn.Module):
    """
    Bahdanau (additive) attention.

    Computes alignment scores between decoder hidden state and all encoder
    hidden states, returns a weighted context vector.
    """

    def __init__(self, hidden_size: int):
        super().__init__()
        self.W_enc = nn.Linear(hidden_size, hidden_size, bias=False)
        self.W_dec = nn.Linear(hidden_size, hidden_size, bias=False)
        self.v = nn.Linear(hidden_size, 1, bias=False)

    def forward(
        self,
        decoder_hidden: torch.Tensor,  # (batch, hidden)
        encoder_outputs: torch.Tensor,  # (batch, enc_len, hidden)
    ) -> tuple[torch.Tensor, torch.Tensor]:
        # Expand decoder hidden to match encoder sequence length
        dec_h = decoder_hidden.unsqueeze(1)                 # (batch, 1, hidden)
        energy = torch.tanh(
            self.W_enc(encoder_outputs) + self.W_dec(dec_h) # (batch, enc_len, hidden)
        )
        scores = self.v(energy).squeeze(-1)                 # (batch, enc_len)
        weights = F.softmax(scores, dim=-1)                 # (batch, enc_len)

        # Weighted sum of encoder outputs
        context = torch.bmm(weights.unsqueeze(1), encoder_outputs)  # (batch, 1, hidden)
        context = context.squeeze(1)                                 # (batch, hidden)
        return context, weights
```

The decoder is unrolled one day at a time. At each step it attends over the
encoder outputs, concatenates the resulting context vector with the
previous day's prediction, and feeds that into an LSTM cell followed by a
small feed-forward head that outputs a single discharge value:

```python
class FloodForecastModel(nn.Module):
    """
    Full encoder-decoder model for multi-step discharge forecasting.
    """

    def __init__(
        self,
        input_size: int,
        hidden_size: int = 128,
        num_layers: int = 2,
        dropout: float = 0.3,
        encoder_len: int = 30,
        decoder_len: int = 7,
        fc_hidden: int = 64,
        use_attention: bool = True,
    ):
        super().__init__()
        self.decoder_len = decoder_len

        self.encoder = LSTMEncoder(input_size, hidden_size, num_layers, dropout)
        self.decoder = LSTMDecoder(hidden_size, num_layers, dropout, fc_hidden, use_attention)

    def forward(
        self,
        x: torch.Tensor,
        teacher_forcing_ratio: float = 0.0,
        targets: torch.Tensor | None = None,
    ) -> torch.Tensor:
        # x: (batch, enc_len, input_size)
        enc_outputs, h_n, c_n = self.encoder(x)
        preds = self.decoder(
            enc_outputs, h_n, c_n,
            dec_len=self.decoder_len,
            teacher_forcing_ratio=teacher_forcing_ratio,
            targets=targets,
        )
        return preds  # (batch, dec_len)
```

## Training on a rare event: a flood-weighted loss

Floods are under 8% of the record, so a model trained with plain MSE just
learns to predict "no flood" and still scores well on average. The fix is a
**flood-weighted MSE** that scales each timestep's squared error by how
close its true discharge is to the flood threshold — normal days get
weight ≈1, flood-peak days get weighted up to 5×:

```python
# Flood-weighted MSE: errors on high-discharge timesteps are penalised more.
# Weight = 1 + flood_weight_multiplier * (y / flood_threshold).
# Normal days get weight ~1, flood-peak days get weight up to ~5x.
flood_threshold_normalised = float(cfg.flood_threshold)
flood_weight_multiplier = 4.0  # tune this: higher = more focus on peaks

def criterion(preds: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
    # targets are log-normalised; reconstruct approximate raw scale for weighting
    targets_raw = torch.expm1(
        torch.tensor(
            tgt_scaler.inverse_transform(
                targets.detach().cpu().numpy().reshape(-1, 1)
            ).reshape(targets.shape),
            device=targets.device,
        )
    )
    weights = 1.0 + flood_weight_multiplier * torch.clamp(
        targets_raw / flood_threshold_normalised, min=0.0, max=1.0
    )
    return (weights * (preds - targets) ** 2).mean()
```

## Evaluation — hydrology metrics, not just RMSE

Discharge forecasts get judged against the field's own standard metrics
rather than generic regression error. **NSE** (Nash–Sutcliffe Efficiency)
[Nash & Sutcliffe, 1970] compares the model's error to how well simply
predicting the historical mean would do; **KGE** (Kling–Gupta Efficiency)
[Gupta et al., 2009] separately scores correlation, variability, and bias
and combines them into one number:

```python
def nse(obs: np.ndarray, sim: np.ndarray) -> float:
    """Nash-Sutcliffe Efficiency."""
    obs, sim = np.asarray(obs, float), np.asarray(sim, float)
    mask = np.isfinite(obs) & np.isfinite(sim)
    obs, sim = obs[mask], sim[mask]
    num = np.sum((obs - sim) ** 2)
    denom = np.sum((obs - np.mean(obs)) ** 2)
    if denom == 0:
        return np.nan
    return float(1.0 - num / denom)


def kge(obs: np.ndarray, sim: np.ndarray) -> float:
    """Kling-Gupta Efficiency (Gupta et al. 2009)."""
    obs, sim = np.asarray(obs, float), np.asarray(sim, float)
    mask = np.isfinite(obs) & np.isfinite(sim)
    obs, sim = obs[mask], sim[mask]

    r = np.corrcoef(obs, sim)[0, 1]
    alpha = np.std(sim) / (np.std(obs) + 1e-9)
    beta = np.mean(sim) / (np.mean(obs) + 1e-9)
    return float(1.0 - np.sqrt((r - 1) ** 2 + (alpha - 1) ** 2 + (beta - 1) ** 2))
```

## Results

On unseen years (data the model never trained on):

| Metric | Score | Reading |
|---|---|---|
| NSE | **0.924** | >0.90 is considered excellent |
| KGE | **0.920** | >0.90 is considered excellent |
| POD (Probability of Detection) | **0.651** | catches 65% of actual flood events |
| FAR (False Alarm Ratio) | **0.065** | only 6.5% of flood alarms are false |
