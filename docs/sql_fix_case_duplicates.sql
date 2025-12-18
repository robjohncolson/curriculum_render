-- =============================================
-- SQL Fix for Case Duplicates in Answers Table
-- Run AFTER the main cleanup script
-- Date: 2024-12-17
-- =============================================

-- STEP 1: Delete older duplicate answers (keep the most recent)
-- These are cases where the same user answered the same question
-- with different case variants of their username

DELETE FROM public.answers WHERE username = 'Apple_Monkey' AND question_id = 'U2-L4-Q01';
DELETE FROM public.answers WHERE username = 'Apple_Monkey' AND question_id = 'U2-L4-Q02';
DELETE FROM public.answers WHERE username = 'Apple_Monkey' AND question_id = 'U2-L4-Q03';
DELETE FROM public.answers WHERE username = 'Apple_Rabbit' AND question_id = 'U1-L2-Q01';
DELETE FROM public.answers WHERE username = 'Apple_Rabbit' AND question_id = 'U1-L2-Q02';
DELETE FROM public.answers WHERE username = 'Apple_Rabbit' AND question_id = 'U1-L2-Q03';
DELETE FROM public.answers WHERE username = 'Apple_Rabbit' AND question_id = 'U1-L3-Q01';
DELETE FROM public.answers WHERE username = 'Apple_Rabbit' AND question_id = 'U1-L3-Q02';
DELETE FROM public.answers WHERE username = 'Apple_Rabbit' AND question_id = 'U1-L3-Q03';
DELETE FROM public.answers WHERE username = 'Apple_Rabbit' AND question_id = 'U1-L4-Q01';
DELETE FROM public.answers WHERE username = 'Apple_Rabbit' AND question_id = 'U1-L4-Q02';
DELETE FROM public.answers WHERE username = 'Apple_Rabbit' AND question_id = 'U1-L4-Q03';
DELETE FROM public.answers WHERE username = 'Apple_Rabbit' AND question_id = 'U1-L4-Q04';
DELETE FROM public.answers WHERE username = 'Apple_Rabbit' AND question_id = 'U1-L4-Q05';
DELETE FROM public.answers WHERE username = 'Apple_Rabbit' AND question_id = 'U1-L4-Q06';
DELETE FROM public.answers WHERE username = 'Apple_Rabbit' AND question_id = 'U1-L5-Q01';
DELETE FROM public.answers WHERE username = 'Apple_Rabbit' AND question_id = 'U1-L5-Q02';
DELETE FROM public.answers WHERE username = 'Apple_Rabbit' AND question_id = 'U1-L5-Q03';
DELETE FROM public.answers WHERE username = 'Grape_Fox' AND question_id = 'U1-PC-MCQ-A-Q01';
DELETE FROM public.answers WHERE username = 'Mango_Dog' AND question_id = 'U2-L6-Q03';
DELETE FROM public.answers WHERE username = 'Papaya_Goat' AND question_id = 'U1-L3-Q01';
DELETE FROM public.answers WHERE username = 'Papaya_Goat' AND question_id = 'U1-L3-Q02';
DELETE FROM public.answers WHERE username = 'Papaya_Goat' AND question_id = 'U1-L3-Q03';
DELETE FROM public.answers WHERE username = 'Papaya_Goat' AND question_id = 'U1-L4-Q01';
DELETE FROM public.answers WHERE username = 'Papaya_Goat' AND question_id = 'U1-L4-Q02';
DELETE FROM public.answers WHERE username = 'Papaya_Goat' AND question_id = 'U1-L4-Q03';
DELETE FROM public.answers WHERE username = 'Papaya_Goat' AND question_id = 'U1-L4-Q04';
DELETE FROM public.answers WHERE username = 'Papaya_Goat' AND question_id = 'U1-L4-Q05';
DELETE FROM public.answers WHERE username = 'Papaya_Goat' AND question_id = 'U1-L4-Q06';
DELETE FROM public.answers WHERE username = 'Plum_Iguana' AND question_id = 'U1-L3-Q01';
DELETE FROM public.answers WHERE username = 'Plum_Iguana' AND question_id = 'U1-L3-Q02';
DELETE FROM public.answers WHERE username = 'Plum_Iguana' AND question_id = 'U1-L3-Q03';
DELETE FROM public.answers WHERE username = 'Plum_Iguana' AND question_id = 'U1-L4-Q01';
DELETE FROM public.answers WHERE username = 'Plum_Iguana' AND question_id = 'U1-L4-Q02';
DELETE FROM public.answers WHERE username = 'Plum_Iguana' AND question_id = 'U1-L4-Q03';
DELETE FROM public.answers WHERE username = 'Plum_Iguana' AND question_id = 'U1-L4-Q04';
DELETE FROM public.answers WHERE username = 'Plum_Iguana' AND question_id = 'U1-L4-Q05';
DELETE FROM public.answers WHERE username = 'Plum_Iguana' AND question_id = 'U1-L4-Q06';
DELETE FROM public.answers WHERE username = 'Plum_Iguana' AND question_id = 'U1-L9-Q01';
DELETE FROM public.answers WHERE username = 'Plum_Iguana' AND question_id = 'U1-L9-Q02';
DELETE FROM public.answers WHERE username = 'Plum_Iguana' AND question_id = 'U1-L9-Q03';

-- STEP 2: Now normalize remaining lowercase usernames to Title_Case
UPDATE public.answers SET username = 'Apple_Monkey' WHERE username = 'apple_monkey';
UPDATE public.answers SET username = 'Apple_Rabbit' WHERE username = 'apple_rabbit';
UPDATE public.answers SET username = 'Grape_Fox' WHERE username = 'grape_fox';
UPDATE public.answers SET username = 'Lemon_Eagle' WHERE username = 'lemon_eagle';
UPDATE public.answers SET username = 'Mango_Dog' WHERE username = 'mango_dog';
UPDATE public.answers SET username = 'Papaya_Goat' WHERE username = 'papaya_goat';
UPDATE public.answers SET username = 'Plum_Iguana' WHERE username = 'Plum_iguana';

-- =============================================
-- Summary:
-- - Deleted 42 older duplicate answers (keeping most recent)
-- - Normalized 7 users' lowercase answers to Title_Case
-- =============================================
