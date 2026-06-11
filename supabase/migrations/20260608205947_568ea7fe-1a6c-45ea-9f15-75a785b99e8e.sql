CREATE TABLE public.personnes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  age INTEGER NOT NULL
);
GRANT SELECT ON public.personnes TO anon, authenticated;
GRANT ALL ON public.personnes TO service_role;
ALTER TABLE public.personnes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read personnes" ON public.personnes FOR SELECT USING (true);
INSERT INTO public.personnes (nom, prenom, age) VALUES
  ('Allagui', 'Bochra', 28),
  ('Ben Ali', 'Mohamed', 35),
  ('Trabelsi', 'Sarah', 22),
  ('Khelifi', 'Youssef', 41);