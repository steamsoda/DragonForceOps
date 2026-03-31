-- Second no-op migration to trigger a fresh preview workflow run after secret rotation.
do $$
begin
  null;
end
$$;
