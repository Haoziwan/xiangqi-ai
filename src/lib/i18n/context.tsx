"use client"

import React, { createContext, useContext } from "react"
import { translations } from "./translations"

interface LanguageContextType {
  language: 'zh'
  setLanguage: (lang: 'zh') => void
  t: (key: string, variables?: Record<string, any>) => string
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children }: { children: React.ReactNode, initialLanguage?: string }) {
  const language = 'zh'

  const setLanguage = (_lang: 'zh') => {
    // No-op or just do nothing as it's Chinese-only
  }

  const t = (key: string, variables?: Record<string, any>) => {
    const translation = (translations.zh as any)[key] || key
    
    if (variables) {
      return Object.entries(variables).reduce((acc, [k, v]) => {
        return acc.replace(`{${k}}`, String(v))
      }, translation)
    }
    
    return translation
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useI18n() {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error("useI18n must be used within a LanguageProvider")
  }
  return context
}
