[default]
default:
    @just --list

[windows]
[script("pwsh")]
update-bookmarks:
    ./scripts/update-bookmarks.ps1
