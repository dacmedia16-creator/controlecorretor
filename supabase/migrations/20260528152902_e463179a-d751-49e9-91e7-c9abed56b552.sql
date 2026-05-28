UPDATE public.broker_candidate_interactions
SET next_follow_up_date = next_follow_up_date + interval '3 hours'
WHERE interaction_type = 'entrevista'
  AND next_follow_up_date IS NOT NULL
  AND created_at < now();