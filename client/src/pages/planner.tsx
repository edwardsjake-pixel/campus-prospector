import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { useState } from "react";

export default function Planner() {
  const [date, setDate] = useState<Date | undefined>(new Date());

  return (
    <Layout>
      <div className="space-y-2 mb-6">
        <h1 className="text-3xl font-display font-bold text-slate-900">Visit Planner</h1>
        <p className="text-slate-500">Schedule your upcoming campus visits and office hours.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="border-none shadow-md">
          <CardContent className="p-4">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              className="rounded-md border-none w-full flex justify-center"
            />
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          <h3 className="font-semibold text-lg text-slate-800">
            Available Office Hours for {date?.toLocaleDateString()}
          </h3>
          
          <div className="bg-white rounded-xl p-8 text-center border border-dashed border-slate-200">
            <p className="text-slate-500">Select a date to see instructor office hours.</p>
            <p className="text-xs text-slate-400 mt-2">
              (Feature coming soon: This will automatically match selected date with instructor office hour schedules)
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
