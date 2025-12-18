-- =============================================
-- SQL Cleanup Script for AP Stats
-- Run in Supabase SQL Editor
-- Date: 2024-12-17
-- =============================================

-- 1. Merge Cherry_Lemon answers into Coconut_Cat (Moshammed)
--    This transfers all Cherry_Lemon's work to her main account
UPDATE public.answers
SET username = 'Coconut_Cat'
WHERE username = 'Cherry_Lemon';

-- 2. Delete Cherry_Lemon from users table (now merged)
DELETE FROM public.users WHERE username = 'cherry_lemon';

-- 3. Delete orphan 'Student' accounts from users table
DELETE FROM public.users WHERE username = 'tayberry_pelican';
DELETE FROM public.users WHERE username = 'honeydew_crocodile';
DELETE FROM public.users WHERE username = 'bilberry_lemur';
DELETE FROM public.users WHERE username = 'lemon_monkey';
DELETE FROM public.users WHERE username = 'lime_lion';
DELETE FROM public.users WHERE username = 'papaya_cat';
DELETE FROM public.users WHERE username = 'coconut_serval';

-- 4. Assign Emily to Kiwi_Monkey
UPDATE public.users SET real_name = 'Emily' WHERE username = 'kiwi_monkey';

-- 5. Fix case sensitivity: Update users table usernames to Title_Case
--    to match how the app generates them and how answers are stored
UPDATE public.users SET username = 'Apple_Monkey' WHERE username = 'apple_monkey';
UPDATE public.users SET username = 'Apple_Rabbit' WHERE username = 'apple_rabbit';
UPDATE public.users SET username = 'Apricot_Dog' WHERE username = 'apricot_dog';
UPDATE public.users SET username = 'Apricot_Fox' WHERE username = 'apricot_fox';
UPDATE public.users SET username = 'Apricot_Horse' WHERE username = 'apricot_horse';
UPDATE public.users SET username = 'Banana_Fox' WHERE username = 'banana_fox';
UPDATE public.users SET username = 'Banana_Goat' WHERE username = 'banana_goat';
UPDATE public.users SET username = 'Berry_Iguana' WHERE username = 'berry_iguana';
UPDATE public.users SET username = 'Cherry_Monkey' WHERE username = 'cherry_monkey';
UPDATE public.users SET username = 'Coconut_Cat' WHERE username = 'coconut_cat';
UPDATE public.users SET username = 'Grape_Fox' WHERE username = 'grape_fox';
UPDATE public.users SET username = 'Grape_Koala' WHERE username = 'grape_koala';
UPDATE public.users SET username = 'Grape_Newt' WHERE username = 'grape_newt';
UPDATE public.users SET username = 'Guava_Cat' WHERE username = 'guava_cat';
UPDATE public.users SET username = 'Guava_Wolf' WHERE username = 'guava_wolf';
UPDATE public.users SET username = 'Kiwi_Monkey' WHERE username = 'kiwi_monkey';
UPDATE public.users SET username = 'Kiwi_Panda' WHERE username = 'kiwi_panda';
UPDATE public.users SET username = 'Lemon_Eagle' WHERE username = 'lemon_eagle';
UPDATE public.users SET username = 'Lemon_Goat' WHERE username = 'lemon_goat';
UPDATE public.users SET username = 'Mango_Dog' WHERE username = 'mango_dog';
UPDATE public.users SET username = 'Mango_Panda' WHERE username = 'mango_panda';
UPDATE public.users SET username = 'Mango_Tiger' WHERE username = 'mango_tiger';
UPDATE public.users SET username = 'Papaya_Eagle' WHERE username = 'papaya_eagle';
UPDATE public.users SET username = 'Papaya_Fox' WHERE username = 'papaya_fox';
UPDATE public.users SET username = 'Papaya_Goat' WHERE username = 'papaya_goat';
UPDATE public.users SET username = 'Papaya_Iguana' WHERE username = 'papaya_iguana';
UPDATE public.users SET username = 'Plum_Iguana' WHERE username = 'plum_iguana';

-- Also fix any other accounts that might have been added with different casing
UPDATE public.users SET username = 'Carambola_Jaguar' WHERE username = 'carambola_jaguar';
UPDATE public.users SET username = 'Teacher_Man' WHERE username = 'teacher_man';

-- =============================================
-- 6. Consolidate duplicate student names
-- =============================================

-- CHANLITA: Merge Grape_Newt (12 answers) into Grape_Koala (44 answers)
UPDATE public.answers
SET username = 'Grape_Koala'
WHERE username = 'Grape_Newt';

DELETE FROM public.users WHERE username = 'Grape_Newt';
DELETE FROM public.users WHERE username = 'grape_newt';

-- JULISSA: Merge Banana_Fox (6 answers) into Apricot_Dog (76 answers)
UPDATE public.answers
SET username = 'Apricot_Dog'
WHERE username = 'Banana_Fox';

DELETE FROM public.users WHERE username = 'Banana_Fox';
DELETE FROM public.users WHERE username = 'banana_fox';

-- Update Julissa's name to be consistent (remove "B" suffix)
UPDATE public.users SET real_name = 'Julissa' WHERE username = 'Apricot_Dog';
UPDATE public.users SET real_name = 'Julissa' WHERE username = 'apricot_dog';

-- =============================================
-- Summary of changes:
-- - Merged Cherry_Lemon -> Coconut_Cat (Moshammed's consolidated account)
-- - Deleted 7 orphan "Student" accounts
-- - Assigned Emily to Kiwi_Monkey (92 answers, morning class)
-- - Fixed username case to Title_Case to match answers table
-- - Merged Chanlita: Grape_Newt -> Grape_Koala (56 total answers)
-- - Merged Julissa: Banana_Fox -> Apricot_Dog (82 total answers)
-- =============================================
