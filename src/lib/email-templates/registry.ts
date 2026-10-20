import type { ComponentType } from 'react'

import { template as invitoCollegamento } from './invito-collegamento'
import { template as nuovaRichiestaVendo } from './nuova-richiesta-vendo'
import { template as richiestaVendoApprovata } from './richiesta-vendo-approvata'
import { template as richiestaVendoRifiutata } from './richiesta-vendo-rifiutata'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  'invito-collegamento': invitoCollegamento,
  'nuova-richiesta-vendo': nuovaRichiestaVendo,
  'richiesta-vendo-approvata': richiestaVendoApprovata,
  'richiesta-vendo-rifiutata': richiestaVendoRifiutata,
}
