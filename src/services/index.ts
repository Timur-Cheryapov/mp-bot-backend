// Export all service-related types and functions
export * from './supabase';
export * from './database';

// Export the Supabase client instance
import { getSupabaseClient, supabaseService } from './supabase';
export { getSupabaseClient, supabaseService }; 