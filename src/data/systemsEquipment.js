import { supabase } from '../supabaseClient.js'

// Reference data — rarely changes, so no caching layer yet (add one in
// lib/ if repeated fetches become a real cost).
export async function fetchSystemsWithEquipment() {
  const [systemsResult, equipmentResult] = await Promise.all([
    supabase.from('systems').select('*').order('sort_order'),
    supabase.from('equipment').select('*').order('sort_order'),
  ])

  if (systemsResult.error) throw systemsResult.error
  if (equipmentResult.error) throw equipmentResult.error

  const equipment = equipmentResult.data
  return systemsResult.data.map((system) => ({
    ...system,
    equipment: equipment.filter((item) => item.system_id === system.id),
  }))
}
