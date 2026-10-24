import { Suspense } from "react";
import { Playground } from "@/components/Playground";

export const metadata = { title: "Playground" };

async function Loaded({ searchParams }: Pick<PageProps<"/playground">, "searchParams">) {
  const q = await searchParams;
  const prompt = typeof q.prompt === "string" ? q.prompt : "";
  const budget = Number(q.budget);
  return <Playground initialPrompt={prompt} initialBudget={budget >= 50 && budget <= 500 ? budget : 240} />;
}

export default function PlaygroundPage({ searchParams }: PageProps<"/playground">) {
  return (
    <Suspense>
      <Loaded searchParams={searchParams} />
    </Suspense>
  );
}
