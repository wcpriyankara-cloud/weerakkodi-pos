// app/(protected)/expenses/page.jsx
import ExpenseManager from "@/components/ExpenseManager";

export const metadata = {
  title: "වියදම් කළමනාකරණය | Expense Manager",
  description: "Manage your business expenses",
};

export default function ExpensesPage() {
  return <ExpenseManager lang="si" />;
}