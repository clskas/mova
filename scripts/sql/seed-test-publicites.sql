-- Publicités démo (sans commandes)
INSERT INTO publicites (id, titre, "imageUrl", lien, description, cible, "isActive", "dateDebut", "dateFin", "sortOrder", "createdAt", "updatedAt")
VALUES
  (
    gen_random_uuid()::text,
    'Evenements et reunions',
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&h=400&fit=crop',
    'https://mova.cd',
    'Reservez des salles de reunion equipees aux meilleurs prix',
    'TOUS',
    true,
    NOW() - INTERVAL '1 day',
    NOW() + INTERVAL '90 days',
    0,
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid()::text,
    'Afrisoft shop',
    'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=400&fit=crop',
    'https://www.afri-soft.com/',
    'Africa software technologie',
    'TOUS',
    true,
    NOW() - INTERVAL '1 day',
    NULL,
    1,
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid()::text,
    'MOVA Chauffeur',
    'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=400&h=400&fit=crop',
    NULL,
    'Passez en ligne et augmentez vos revenus',
    'DRIVER',
    true,
    NOW() - INTERVAL '1 day',
    NOW() + INTERVAL '60 days',
    2,
    NOW(),
    NOW()
  );
