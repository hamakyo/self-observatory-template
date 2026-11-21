# Assets

`assets/` contains curated binary files that are useful enough to keep with the Personal OS.

Default policy:

- small/important images: keep in Git
- bulk or large media: do not add by default
- generated caches: keep out of Git

Suggested layout:

```text
assets/
├── images/YYYY/MM/
├── documents/
└── thumbnails/
```

Semantic metadata belongs in `media/`, not in filenames alone.

If bytes later move to object storage, preserve the stable media note ID and provenance.
