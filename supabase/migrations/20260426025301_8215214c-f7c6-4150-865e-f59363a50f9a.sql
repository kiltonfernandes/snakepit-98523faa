UPDATE public.app_settings
SET prompt_overrides_json = prompt_overrides_json - 'material_descriptions_instructions'
WHERE singleton_id = 1
  AND prompt_overrides_json ? 'material_descriptions_instructions';