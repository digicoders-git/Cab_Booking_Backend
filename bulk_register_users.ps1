$baseUrl = "http://localhost:5000/api/users/login"
$otp = "123456"

for ($i = 1; $i -le 50; $i++) {
    $phone = "9000000$(if ($i -lt 10) { "0$i" } else { $i })"
    $name = "Test User $i"
    $email = "user$i@example.com"

    $body = @{
        phone = $phone
        otp = $otp
        name = $name
        email = $email
    } | ConvertTo-Json

    Try {
        $response = Invoke-RestMethod -Uri $baseUrl -Method Post -Body $body -ContentType "application/json"
        Write-Host "Success: Created $name ($phone)" -ForegroundColor Green
    } Catch {
        Write-Host "Failed: $name ($phone) - $($_.Exception.Message)" -ForegroundColor Red
    }
}
