import { supabase } from '../../../supabase/supabaseClient'

export const LookupService = {
  async listProfileSourcing() {
    try {
      const { data, error } = await supabase.from('profile_sourcing').select('*').eq('is_active', true).order('name', { ascending: true })
      if (error) throw error
      return data || []
    } catch (e) {
      console.error('LookupService.listProfileSourcing error', e)
      return []
    }
  },

  async listConsultants() {
    try {
      const { data, error } = await supabase.from('consultants').select('*').eq('is_active', true).order('name', { ascending: true })
      if (error) throw error
      return data || []
    } catch (e) {
      console.error('LookupService.listConsultants error', e)
      return []
    }
  }
}

export default LookupService
