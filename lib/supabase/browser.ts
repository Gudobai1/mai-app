'use client'

import { createClient, type Session } from '@supabase/supabase-js'
import { getSupabasePublicConfig } from './config'

const ACCESS_TOKEN_KEY = 'mai-supabase-access-token'
const REFRESH_TOKEN_KEY = 'mai-supabase-refresh-token'

export function createStatelessSupabaseClient() {
  const config = getSupabasePublicConfig()
  if (!config) return null
  return createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function readSupabaseAccessToken() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(ACCESS_TOKEN_KEY) || ''
}

export function readSupabaseRefreshToken() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(REFRESH_TOKEN_KEY) || ''
}

export function hasStoredSupabaseSession() {
  return Boolean(readSupabaseAccessToken() && readSupabaseRefreshToken())
}

export function saveSupabaseSession(session: Session) {
  localStorage.setItem(ACCESS_TOKEN_KEY, session.access_token)
  localStorage.setItem(REFRESH_TOKEN_KEY, session.refresh_token)
}

export function clearSupabaseSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}
