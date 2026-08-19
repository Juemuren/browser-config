def walk_bookmarks:
    if .type == "url" then
        { 
            name: .name,
            url: .url
        }
    elif .type == "folder" then
        {
            name: .name,
            children: [ .children[] | walk_bookmarks ]
        }
    else
        empty
end;

{
    bookmark_bar: [
        .roots.bookmark_bar.children[] | walk_bookmarks
    ],
    other: [
        .roots.other.children[] | walk_bookmarks
    ],
    synced: [
        .roots.synced.children[]? | walk_bookmarks
    ]
}