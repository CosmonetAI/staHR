import { supabase } from '../../../supabase/supabaseClient'
import { UploadRecord } from '../../../types'

export const UploadService = {
  async createUpload(record: UploadRecord) {
    const { data, error } = await supabase.from('uploads').insert([record]).select().single()
    if (error) throw error
    return data
  }
}
