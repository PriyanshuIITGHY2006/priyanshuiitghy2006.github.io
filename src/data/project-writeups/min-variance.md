## The problem

In Modern Portfolio Theory, a portfolio's risk is its return *variance*,
and the **minimum-variance portfolio** is the mix of assets that makes that
variance as small as possible. This script pulls historical prices for
five tickers via **yfinance**, estimates how they move together, and solves
directly for the risk-minimizing, long-only weights.

## Keeping the covariance matrix usable

A sample covariance matrix, estimated straight from historical returns, is
often not quite **positive semi-definite** due to floating-point noise —
which breaks the optimization that follows. This function clips any
negative eigenvalues up to a tiny epsilon and reconstructs a valid matrix
from the corrected eigendecomposition:

```python
def nearest_psd(A, eps=1e-10):
    A = np.array(A, dtype=float)
    A = (A + A.T) / 2
    vals, vecs = np.linalg.eigh(A)
    vals = np.maximum(vals, eps)
    A_psd = vecs @ np.diag(vals) @ vecs.T
    return (A_psd + A_psd.T) / 2
```

## Solving for the weights

The unconstrained minimum-variance solution has a closed form:
`w = Σ⁻¹𝟙 / (𝟙ᵀΣ⁻¹𝟙)`, using the Moore–Penrose pseudo-inverse so it's
well-defined even when `Σ` is singular. That alone can still produce
negative weights (a short position), so the no-short-selling constraint is
enforced afterward by clipping negatives to zero and renormalizing so the
weights sum back to 1:

```python
def compute_min_var_weights(Sigma_df):
    Sigma = Sigma_df.values
    n = Sigma.shape[0]
    Sigma_psd = nearest_psd(Sigma)
    ones = np.ones(n)
    Sigma_inv = np.linalg.pinv(Sigma_psd)
    w = Sigma_inv @ ones
    d = ones @ w
    if d == 0 or np.isnan(d):
        w = np.ones(n) / n
    else:
        w = w / d
    w[w < 0] = 0
    s = w.sum()
    if s == 0 or np.isnan(s):
        w = np.ones(n) / n
    else:
        w = w / s
    return pd.Series(w, index=Sigma_df.index)
```

The rest of the script is defensive plumbing around real-world Yahoo
Finance data: `extract_adj_close()` handles both the old flat-column and
newer multi-index response shapes, `clean_and_select_columns()` drops
duplicate/missing tickers with a warning instead of crashing, and the CLI
loop forward/backward-fills small gaps before computing daily returns and
covariance.

## Running it

Five tickers in, a `weights.csv` out — no short selling, weights sum to 1:

```
Enter 5 tickers separated by spaces:
AAPL MSFT AMZN TSLA GOOG

Minimum-Variance Weights
        weight
AAPL    0.183...
MSFT    0.241...
AMZN    0.096...
TSLA    0.052...
GOOG    0.427...

Saved weights.csv
```
