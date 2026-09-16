<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class OtpCodeMail extends Mailable
{
    use Queueable, SerializesModels;

    public User $user;
    public string $code;
    public string $purpose;

    public function __construct(User $user, string $code, string $purpose = 'password_reset')
    {
        $this->user = $user;
        $this->code = $code;
        $this->purpose = $purpose;
    }

    public function build()
    {
        $subject = match ($this->purpose) {
            'email_verification' => 'AgriBantay Email Verification Code',
            'farm_deletion'      => 'AgriBantay Farm Deletion Verification Code',
            default               => 'AgriBantay Password Reset Code',
        };

        return $this->subject($subject)
            ->view('emails.otp-code');
    }
}