[default]
default:
    @just --list

[windows]
[script("pwsh")]
update-bookmarks:
    ./scripts/update-bookmarks.ps1

[windows]
[script("pwsh")]
update-search-engines:
    ./scripts/update-search-engines.ps1
