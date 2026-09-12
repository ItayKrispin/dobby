import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-primary">Dobby</p>
          <h1 className="text-3xl font-bold tracking-tight">
            פקיד קבלה בוואטסאפ
          </h1>
          <p className="text-lg leading-relaxed text-muted-foreground">
            לעצמאים בשירותי שטח — אוסף את הקריאה לפני שזה מטריד אותך.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard/jobs"
            className={cn(buttonVariants({ size: "lg" }), "px-6")}
          >
            לוח בקרה
          </Link>
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "px-6")}
          >
            כניסה
          </Link>
        </div>
      </div>
    </main>
  );
}
