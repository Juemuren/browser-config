jq -f .\scripts\export-edge-bookmarks.jq "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Bookmarks"
    | yq -P -o=yaml > "core/bookmarks.yaml"