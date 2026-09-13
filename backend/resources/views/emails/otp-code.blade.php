<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; background-color:#f0ebdd; font-family: Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0ebdd; padding:30px 0;">
        <tr>
            <td align="center">
                <table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden;">
                    <tr>
                        <td style="background-color:#14301c; padding:24px 30px;">
                            <span style="color:#F2B84B; font-size:20px; font-weight:bold;">AgriBantay</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:32px 30px;">
                            <h2 style="color:#16311d; margin:0 0 14px;">Password Reset Code</h2>
                            <p style="color:#4b5a50; font-size:14px; line-height:1.6; margin:0 0 22px;">
                                Hi {{ $user->first_name }}, use the code below to verify your identity and reset your AgriBantay password. This code expires in 10 minutes.
                            </p>
                            <div style="background-color:#f0ebdd; border-radius:10px; padding:18px; text-align:center; font-size:32px; font-weight:bold; letter-spacing:8px; color:#14301c;">
                                {{ $code }}
                            </div>
                            <p style="color:#9aa79d; font-size:12.5px; margin:22px 0 0;">
                                If you didn't request this, you can safely ignore this email — your password won't change unless this code is used.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>