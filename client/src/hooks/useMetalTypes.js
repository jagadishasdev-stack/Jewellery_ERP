import { useQuery } from '@tanstack/react-query';
import { masterApi } from '../api/modules';

/**
 * useMetalTypes — the live source of truth for the metal-type list, backed
 * by tbl_metal_type_master (see Master Management > Metal & Purity). Used
 * everywhere a dropdown/filter/validation previously imported the
 * hardcoded METAL_TYPES/METAL_TYPES_WITH_PURITY arrays from
 * utils/metalTypes.js — a custom metal type an admin adds there is
 * immediately usable everywhere this hook is used, no code change needed.
 * React Query caches this app-wide under one shared key, so using the hook
 * in many components costs one network call, not one per component.
 */
export function useMetalTypes() {
  const { data, isLoading } = useQuery({
    queryKey: ['metal-types'],
    queryFn: () => masterApi.getMetalTypes().then((r) => r.data.data),
    staleTime: 5 * 60 * 1000,
  });

  const rows = data || [];
  return {
    metalTypeRows: rows, // full rows (Metal_Type_ID, Description, Default_Purity_ID, Has_Purity...) for the Master Management CRUD screen
    metalTypes: rows.map((m) => m.Metal_Name),
    metalTypesWithPurity: rows.filter((m) => m.Has_Purity).map((m) => m.Metal_Name),
    isLoading,
  };
}
