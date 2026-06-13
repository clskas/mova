import { Injectable } from '@nestjs/common';
import { ServiceCategory } from '@mova/shared';

export interface MovaServiceMeta {
  id: string;
  nameFr: string;
  available: boolean;
  category: ServiceCategory;
  description?: string;
}

@Injectable()
export class ServicesCatalogService {
  list(): MovaServiceMeta[] {
    return [
      { id: 'taxi', nameFr: 'Course taxi', available: true, category: ServiceCategory.TRANSPORT, description: 'Moto-taxi, Standard et Confort à Kinshasa' },
      { id: 'scheduled', nameFr: 'Réservation planifiée', available: true, category: ServiceCategory.TRANSPORT, description: 'Réservez une course jusqu\'à J+7' },
      { id: 'parcel', nameFr: 'Livraison colis', available: true, category: ServiceCategory.DELIVERY, description: 'Envoi de colis et documents en ville' },
      { id: 'food', nameFr: 'Livraison repas', available: true, category: ServiceCategory.DELIVERY, description: 'Commandez auprès des restaurants partenaires' },
      { id: 'errand', nameFr: 'Courses & commissions', available: true, category: ServiceCategory.DELIVERY, description: 'Faites vos courses ou déléguez une commission' },
      { id: 'carpool', nameFr: 'Covoiturage', available: true, category: ServiceCategory.TRANSPORT, description: 'Partagez un trajet et économisez' },
      { id: 'rental', nameFr: 'Location véhicule', available: true, category: ServiceCategory.TRANSPORT, description: 'Catalogue véhicules et réservation en ligne' },
      { id: 'wallet', nameFr: 'Portefeuille MOVA', available: true, category: ServiceCategory.OTHER, description: 'Paiement et retrait mobile money' },
      { id: 'express', nameFr: 'Livraison express', available: true, category: ServiceCategory.DELIVERY, description: 'Livraison prioritaire en moins de 45 min' },
      { id: 'moving', nameFr: 'Déménagement', available: true, category: ServiceCategory.OTHER, description: 'Transport de meubles et cartons à Kinshasa' },
    ];
  }
}
