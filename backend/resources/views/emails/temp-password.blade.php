<!DOCTYPE html>
<html>
<body style="font-family: 'Public Sans', Arial, sans-serif; background:#f0ebdd; padding:32px 0; margin:0;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:16px; overflow:hidden;">
          <tr>
            <td style="background:#1B4332; padding:28px 32px;">
              <span style="color:#F2B84B; font-size:20px; font-weight:800;">AgriBantay</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="color:#16311d; margin:0 0 12px;">
                {{ $context === 'welcome' ? 'Welcome to AgriBantay' : 'Password Reset' }}
              </h2>
              <p style="color:#4b5a50; font-size:14px; line-height:1.6; margin:0 0 20px;">
                @if($context === 'welcome')
                  Hi {{ $user->first_name }}, your AgriBantay account has been created. Use the temporary
                  password below to log in — you'll be asked to set a new password right away.
                @else
                  Hi {{ $user->first_name }}, a temporary password was requested for your AgriBantay account.
                  Use it to log in, and you'll be asked to set a new password right away.
                @endif
              </p>
              <div style="background:#F0EBDD; border-radius:10px; padding:16px; text-align:center; margin-bottom:20px;">
                <span style="font-size:20px; font-weight:800; letter-spacing:2px; color:#1B4332;">{{ $tempPassword }}</span>
              </div>
              <p style="color:#9aa79d; font-size:12.5px; line-height:1.6; margin:0;">
                @if($context === 'welcome')
                  If you weren't expecting this account, please contact the Municipal Agriculture Office.
                @else
                  If you didn't request this, you can safely ignore this email — your password won't change
                  unless someone logs in with this temporary password.
                @endif
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>