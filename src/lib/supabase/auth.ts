import { supabase } from './client';
import { AuthError } from '@supabase/supabase-js';

export async function signUp(email: string, password: string, name: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
        },
      },
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Supabase signup error:', error);
    if (error instanceof AuthError) {
      switch (error.status) {
        case 400:
          throw new Error('Invalid email or password format');
        case 422:
          throw new Error('Email already registered');
        default:
          throw new Error(error.message);
      }
    }
    throw new Error('Failed to sign up');
  }
}

export async function signIn(email: string, password: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Supabase login error:', error);
    if (error instanceof AuthError) {
      switch (error.status) {
        case 400:
          throw new Error('Invalid login credentials');
        case 429:
          throw new Error('Too many login attempts. Please try again later.');
        default:
          throw new Error('Login failed. Please try again.');
      }
    }
    throw new Error('Login failed. Please try again.');
  }
}

export async function signOut() {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    console.error('Supabase signout error:', error);
    throw new Error('Failed to sign out');
  }
}

export async function resetPassword(email: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) throw error;
  } catch (error) {
    console.error('Supabase password reset error:', error);
    if (error instanceof AuthError) {
      switch (error.status) {
        case 400:
          throw new Error('Invalid email address');
        case 429:
          throw new Error('Too many requests. Please try again later.');
        default:
          throw new Error('Failed to send reset email');
      }
    }
    throw new Error('Failed to send reset email');
  }
}

export async function updatePassword(newPassword: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) throw error;
  } catch (error) {
    console.error('Supabase password update error:', error);
    if (error instanceof AuthError) {
      switch (error.status) {
        case 400:
          throw new Error('Invalid password format');
        default:
          throw new Error('Failed to update password');
      }
    }
    throw new Error('Failed to update password');
  }
}