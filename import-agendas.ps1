# Uso:
#   .\import-agendas.ps1 -DryRun     -> solo simula, NO escribe en la base ni en el Sheet
#   .\import-agendas.ps1              -> importa y escribe los IDs "TM-..." en el Sheet
param([switch]$DryRun)

$spreadsheetId = "1xekfn1texBcBNC5ER2758d8qa7ZJ818hrNDq19Ri3OQ"
# Reemplaza la siguiente línea con tu Anon Key real de Supabase:
$token         = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpheGtnb3Ric3RjdmJxaHBibm5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NDM5NjgsImV4cCI6MjEwNTMxOTk2OH0.VohRQwA8ooEkbKGlwfOUIwpmXgj-xewIbISKW6ErOyA";

$url           = "https://jaxkgotbstcvbqhpbnnl.supabase.co/functions/v1/sync-google-sheets"

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type"  = "application/json"
}

$meses = "Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre"
$grandTotal = 0

foreach ($mes in $meses) {
    # Lee toda la hoja del mes correspondiente
    $agenda = "'Agenda $mes'"
    Write-Host "`n=== $agenda ===" -ForegroundColor Cyan

    $body = @{
        action        = "import_tours"
        spreadsheetId = $spreadsheetId
        range         = $agenda
        dryRun        = [bool]$DryRun
    } | ConvertTo-Json

    try {
        $r = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $body

        if ($DryRun) {
            Write-Host "Se importarían: $($r.wouldImport) tours. IDs TM- por crear en el Sheet: $($r.wouldWriteBackIds)" -ForegroundColor Yellow
            $grandTotal += $r.wouldImport
        } else {
            $color = if ($r.success) { "Green" } else { "Red" }
            Write-Host "Importados: $($r.importedCount) de $($r.totalParsed)" -ForegroundColor $color
            Write-Host "IDs TM- escritos en el Sheet: $($r.writeBack.written) de $($r.writeBack.attempted)"
            if ($r.writeBack.error) { Write-Host "  No se pudo escribir en el Sheet: $($r.writeBack.error)" -ForegroundColor Red }
            $grandTotal += $r.importedCount
        }

        if ($r.missingColumns.Count -gt 0) {
            Write-Host "AVISO - no encontré estas columnas (¿renombradas?): $($r.missingColumns -join ', ')" -ForegroundColor Yellow
        }
        if ($DryRun -and $r.ignoredHeaders.Count -gt 0) {
            Write-Host "Columnas que existen pero no se importan: $($r.ignoredHeaders -join ', ')" -ForegroundColor DarkGray
        }
        if ($r.duplicates.Count -gt 0) {
            Write-Host "IDs repetidos en la hoja (se les añadió la fecha para no pisarse):" -ForegroundColor Yellow
            $r.duplicates | ForEach-Object { Write-Host "  fila $($_.row): $($_.original) -> $($_.assigned)" }
        }
        if ($r.skipped.Count -gt 0) {
            Write-Host "Filas OMITIDAS (revísalas en la hoja):" -ForegroundColor Yellow
            $r.skipped | ForEach-Object { Write-Host "  fila $($_.row): $($_.reason)" }
        }
        if ($r.unmatched.Count -gt 0) {
            Write-Host "Nombres sin coincidencia en la base:" -ForegroundColor Yellow
            $r.unmatched | ForEach-Object { Write-Host "  $_" }
        }
        if ($r.errors.Count -gt 0) {
            Write-Host "ERRORES de la base de datos:" -ForegroundColor Red
            $r.errors | ForEach-Object { Write-Host "  $_" }
        }
    } catch {
        Write-Host "Error en $agenda :" -ForegroundColor Red
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            Write-Host $reader.ReadToEnd()
        } else {
            Write-Host $_.Exception.Message
        }
    }
}

Write-Host "`nTOTAL: $grandTotal tours" -ForegroundColor Cyan