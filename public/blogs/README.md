# public/blogs/

Images referenced by blog posts live here, one subfolder per post slug:

    public/blogs/<post-slug>/cover.jpg
    public/blogs/<post-slug>/diagram.png

Reference them from the matching Markdown file in `src/data/blogs/` using a
path relative to `public/`, e.g.:

    cover: blogs/<post-slug>/cover.jpg

and, inline in the post body:

    ![Alt text](blogs/<post-slug>/diagram.png)
