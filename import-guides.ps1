# Uso:
#   .\import-guides.ps1 -DryRun   -> solo simula, NO escribe en la base
#   .\import-guides.ps1           -> importa las guias de la pestana "Base_Guias Locales"
param([switch]$DryRun)

$spreadsheetId = "1xekfn1texBcBNC5ER2758d8qa7ZJ818hrNDq19Ri3OQ"
$token         = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpheGtnb3Ric3RjdmJxaHBibm5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NDM5NjgsImV4cCI6MjEwNTMxOTk2OH0.VohRQwA8ooEkbKGlwfOUIwpmXgj-xewIbISKW6ErOyA";
$url           = "https://jaxkgotbstcvbqhpbnnl.supabase.co/functions/v1/sync-google-sheets"

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type"  = "application/json"
}

$body = @{
    action        = "import_guides"
    spreadsheetId = $spreadsheetId
    dryRun        = [bool]$DryRun
} | ConvertTo-Json

try {
    $r = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $body

    Write-Host "Pestana leida: $($r.sheet)  |  Guias en el Sheet: $($r.readFromSheet)" -ForegroundColor Cyan
    if ($DryRun) {
        Write-Host "Se insertarian: $($r.toInsert)  |  Se rellenarian campos vacios en: $($r.toFillBlanks)  |  Sin cambios: $($r.unchanged)" -ForegroundColor Yellow
    } else {
        $color = if ($r.success) { "Green" } else { "Red" }
        Write-Host "Insertadas: $($r.inserted)  |  Campos vacios rellenados en: $($r.filledBlanks)  |  Sin cambios: $($r.unchanged)" -ForegroundColor $color
    }
    if ($r.warnings.Count -gt 0) {
        Write-Host "Avisos:" -ForegroundColor Yellow
        $r.warnings | ForEach-Object { Write-Host "  $_" }
    }
    if ($r.skipped.Count -gt 0) {
        Write-Host "Filas omitidas:" -ForegroundColor Yellow
        $r.skipped | ForEach-Object { Write-Host "  fila $($_.row): $($_.reason)" }
    }
    if ($r.errors.Count -gt 0) {
        Write-Host "ERRORES de la base de datos:" -ForegroundColor Red
        $r.errors | ForEach-Object { Write-Host "  $_" }
    }
} catch {
    Write-Host "Error:" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Host $reader.ReadToEnd()
    } else {
        Write-Host $_.Exception.Message
    }
}