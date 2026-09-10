import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-xl space-y-4 text-center">
        <h1 className="text-4xl font-bold">Dobby</h1>
        <p className="text-lg text-muted-foreground">
          פקיד קבלה בוואטסאפ לעצמאים בשירותי שטח — אוסף את הקריאה לפני שזה מטריד אותך.
        </p>
        <Link href="/dashboard" className={cn(buttonVariants({ size: "lg" }))}>
          לוח בקרה לבעל העסק
        </Link>
      </div>
    </main>
  );
}
