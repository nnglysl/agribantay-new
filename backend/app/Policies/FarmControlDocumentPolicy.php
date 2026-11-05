<?php

namespace App\Policies;

use App\Models\Farm;
use App\Models\FarmControlDocument;
use App\Models\User;

class FarmControlDocumentPolicy
{
    public function viewAny(User $user, Farm $farm): bool
    {
        return in_array($user->role, ['admin', 'super_admin'], true)
            || ($user->role === 'farm_owner' && (int) $farm->user_id === (int) $user->id);
    }

    public function create(User $user, Farm $farm): bool
    {
        return $user->role === 'farm_owner' && (int) $farm->user_id === (int) $user->id;
    }

    public function view(User $user, FarmControlDocument $document): bool
    {
        return $document->farm && $this->viewAny($user, $document->farm);
    }
}
