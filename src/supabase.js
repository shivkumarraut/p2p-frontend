import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://yukbqbqobpmmdvgugqeb.supabase.co", 
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1a2JxYnFvYnBtbWR2Z3VncWViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MzI1MTMsImV4cCI6MjA4MDUwODUxM30.y7t8c206OwEkThZSQ0zauldI_S_kx83hqE4FAhA6QrA"
);
