import { type Employee } from "./employees";

let inMemoryEmployees: Employee[] = [];

export function getEmployeesFromStore(): Employee[] {
  return inMemoryEmployees;
}

export function replaceEmployeesInStore(employees: Employee[]) {
  inMemoryEmployees = employees;
}
