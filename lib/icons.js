import {
  Utensils, ShoppingBasket, Bus, Receipt, Home, ShoppingBag, Film, HeartPulse,
  BookOpen, PiggyBank, MoreHorizontal, Car, Plane, Gift, Coffee, Smartphone,
  Wifi, GraduationCap, Dumbbell, Baby, Dog, Wrench, Fuel, CreditCard, Wallet,
  TrendingUp, Zap, Droplet, Music, Gamepad2, Shirt, Stethoscope, Pill,
  Briefcase, Palmtree, PawPrint, Bike,
} from 'lucide-react';

export const ICON_MAP = {
  Utensils, ShoppingBasket, Bus, Receipt, Home, ShoppingBag, Film, HeartPulse,
  BookOpen, PiggyBank, MoreHorizontal, Car, Plane, Gift, Coffee, Smartphone,
  Wifi, GraduationCap, Dumbbell, Baby, Dog, Wrench, Fuel, CreditCard, Wallet,
  TrendingUp, Zap, Droplet, Music, Gamepad2, Shirt, Stethoscope, Pill,
  Briefcase, Palmtree, PawPrint, Bike,
};

export const ICON_NAMES = Object.keys(ICON_MAP);

export function CategoryIcon({ name, ...props }) {
  const Cmp = ICON_MAP[name] || MoreHorizontal;
  return <Cmp {...props} />;
}
