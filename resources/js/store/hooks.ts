/**
 * Typed hooks — semua komponen memakai ini, bukan `useSelector`/`useDispatch`
 * mentah, agar `RootState`/`AppDispatch` tersambung otomatis.
 */

import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/store";

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector = useSelector.withTypes<RootState>();
