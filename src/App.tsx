import devsAiLogo from '/devs-ai.svg'

function App() {
  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-[32px] row-start-2 items-center animate-pulse">
        <img className="dark:invert" src={devsAiLogo} alt="Devs.ai logo" width={180} height={180} />
        <div className="font-mono list-inside list-decimal text-sm/6 text-center sm:text-left">
          Crafting your new app...
        </div>
      </main>
      <footer className="row-start-3 flex gap-[24px] flex-wrap items-center justify-center"></footer>
    </div>
  )
}

export default App

