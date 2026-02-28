import XiangqiAI from './components/xiangqi-ai'
import { LanguageProvider } from './lib/i18n/context'

function App() {
  return (
    <LanguageProvider initialLanguage="zh">
      <div className="min-h-screen bg-background">
        <XiangqiAI />
      </div>
    </LanguageProvider>
  )
}

export default App
