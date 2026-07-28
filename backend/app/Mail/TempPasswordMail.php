<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class TempPasswordMail extends Mailable
{
    use Queueable, SerializesModels;

    public User $user;
    public string $tempPassword;
    public string $context; // 'reset' or 'welcome'

    public function __construct(User $user, string $tempPassword, string $context = 'reset')
    {
        $this->user = $user;
        $this->tempPassword = $tempPassword;
        $this->context = $context;
    }

    public function build()
    {
        $subject = $this->context === 'welcome'
            ? 'Welcome to AgriBantay — Your Account is Ready'
            : 'AgriBantay Password Reset';

        return $this->subject($subject)->view('emails.temp-password');
    }
}