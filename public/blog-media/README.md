# public/blog-media/

Images referenced by blog posts live here, one subfolder per post slug:

    public/blog-media/<post-slug>/cover.jpg
    public/blog-media/<post-slug>/diagram.png

Reference them from the matching Markdown file in `src/data/blogs/` using a
path relative to `public/`, e.g.:

    cover: blog-media/<post-slug>/cover.jpg

and, inline in the post body:

    ![Alt text](blog-media/<post-slug>/diagram.png)

Named `blog-media` rather than `blogs` deliberately — the SPA has a real
`/blogs` route, and GitHub Pages treats any `public/blogs/` directory as a
real path, which broke direct loads/refreshes of `/blogs` (it 404'd via a
server-side redirect to `/blogs/`, which no client route matches).
