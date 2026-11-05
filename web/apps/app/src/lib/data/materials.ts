import type { Material } from '@/lib/types';

export const materials: Material[] = [
  {
    id: 'pet-clear',
    name: 'Clear PET bottles',
    gwCode: 'GW-PET-01',
    category: 'Plastic',
    tag: 'PET 1',
    carbonFactor: '1.50',
    referencePrice: '4.60',
  },
  {
    id: 'hdpe-natural',
    name: 'Natural HDPE',
    gwCode: 'GW-HDPE-02',
    category: 'Plastic',
    tag: 'HDPE 2',
    carbonFactor: '1.70',
    referencePrice: '7.20',
  },
  {
    id: 'cardboard',
    name: 'Baled cardboard',
    gwCode: 'GW-OCC-03',
    category: 'Paper',
    tag: 'OCC',
    carbonFactor: '0.90',
    referencePrice: '1.65',
  },
  {
    id: 'aluminium',
    name: 'Aluminium cans',
    gwCode: 'GW-AL-04',
    category: 'Metal',
    tag: 'UBC',
    carbonFactor: '9.10',
    referencePrice: '18.50',
  },
  {
    id: 'steel',
    name: 'Scrap steel',
    gwCode: 'GW-ST-05',
    category: 'Metal',
    tag: 'Steel',
    carbonFactor: '1.80',
    referencePrice: '3.40',
  },
  {
    id: 'glass',
    name: 'Mixed glass',
    gwCode: 'GW-GL-06',
    category: 'Glass',
    tag: 'Glass',
    carbonFactor: '0.30',
    referencePrice: '0.85',
  },
];

export const categories = ['Plastic', 'Paper', 'Metal', 'Glass'] as const;

// The list the app reads right now. The mock provider swaps it whenever a
// material is added or edited, so labels and CO2 factors follow the edit.
let current = materials;

/** Called by the mock provider after every change to the materials list. */
export function setMaterialRegistry(list: Material[]) {
  current = list;
}

/** The live materials list, including edits made in this session. */
export function currentMaterials(): Material[] {
  return current;
}

export function materialById(id: string): Material {
  return current.find((material) => material.id === id) ?? current[0];
}
