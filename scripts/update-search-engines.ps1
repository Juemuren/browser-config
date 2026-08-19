Get-Process msedge -ErrorAction SilentlyContinue
    | Stop-Process -Force

sqlite3 `
    -header `
    -csv `
    -cmd ".once core/search-engines.csv" `
    "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Web Data" `
    ".read scripts/export-search-engines.sql"