(function (root) {
  'use strict';

  // Comprehensive revised menu items combining ChillPill (CP), Bro's Burger Hub (BB), and Bardali Sekuwa & Thali (BD).
  // Categorization is structured logically across 17 distinct non-overlapping categories.
  // Bardali food prices have been rounded cleanly to nearest multiple of 5 (ending in 0 or 5).
  // Total items: 280
  const REVISED_MENU_ITEMS = [
  {
    "name": "Americano (Cold)",
    "price": 140,
    "category": "Coffee & Tea",
    "supplier": "chillpill"
  },
  {
    "name": "Americano (Hot)",
    "price": 120,
    "category": "Coffee & Tea",
    "supplier": "chillpill"
  },
  {
    "name": "Black Tea",
    "price": 25,
    "category": "Coffee & Tea",
    "supplier": "bros_burger"
  },
  {
    "name": "Cappuccino",
    "price": 160,
    "category": "Coffee & Tea",
    "supplier": "chillpill"
  },
  {
    "name": "Coffee Latte",
    "price": 160,
    "category": "Coffee & Tea",
    "supplier": "chillpill"
  },
  {
    "name": "Cold Coffee",
    "price": 235,
    "category": "Coffee & Tea",
    "supplier": "bros_burger"
  },
  {
    "name": "Espresso",
    "price": 120,
    "category": "Coffee & Tea",
    "supplier": "chillpill"
  },
  {
    "name": "Hot Lemon with Honey",
    "price": 145,
    "category": "Coffee & Tea",
    "supplier": "bros_burger"
  },
  {
    "name": "Long Coffee",
    "price": 130,
    "category": "Coffee & Tea",
    "supplier": "chillpill"
  },
  {
    "name": "Matka Milk Tea",
    "price": 60,
    "category": "Coffee & Tea",
    "supplier": "bros_burger"
  },
  {
    "name": "Milk Tea",
    "price": 40,
    "category": "Coffee & Tea",
    "supplier": "bros_burger"
  },
  {
    "name": "Oulci Coffee",
    "price": 140,
    "category": "Coffee & Tea",
    "supplier": "chillpill"
  },
  {
    "name": "7up",
    "price": 95,
    "category": "Cold Drinks & Refreshers",
    "supplier": "bardali"
  },
  {
    "name": "Banana Lassi",
    "price": 225,
    "category": "Cold Drinks & Refreshers",
    "supplier": "bros_burger"
  },
  {
    "name": "Coke",
    "price": 60,
    "category": "Cold Drinks & Refreshers",
    "supplier": "chillpill"
  },
  {
    "name": "Coke Zero",
    "price": 60,
    "category": "Cold Drinks & Refreshers",
    "supplier": "chillpill"
  },
  {
    "name": "Extreme",
    "price": 160,
    "category": "Cold Drinks & Refreshers",
    "supplier": "chillpill"
  },
  {
    "name": "Fanta",
    "price": 60,
    "category": "Cold Drinks & Refreshers",
    "supplier": "chillpill"
  },
  {
    "name": "Fresh Lime Soda",
    "price": 145,
    "category": "Cold Drinks & Refreshers",
    "supplier": "bardali"
  },
  {
    "name": "Lemon Sprite",
    "price": 135,
    "category": "Cold Drinks & Refreshers",
    "supplier": "bros_burger"
  },
  {
    "name": "Masala Pepsi",
    "price": 145,
    "category": "Cold Drinks & Refreshers",
    "supplier": "bardali"
  },
  {
    "name": "Mirinda",
    "price": 95,
    "category": "Cold Drinks & Refreshers",
    "supplier": "bardali"
  },
  {
    "name": "Mountain Dew",
    "price": 95,
    "category": "Cold Drinks & Refreshers",
    "supplier": "bardali"
  },
  {
    "name": "Pepsi",
    "price": 95,
    "category": "Cold Drinks & Refreshers",
    "supplier": "bardali"
  },
  {
    "name": "Plain Lime Soda",
    "price": 95,
    "category": "Cold Drinks & Refreshers",
    "supplier": "bardali"
  },
  {
    "name": "Real Juice (Bottle)",
    "price": 600,
    "category": "Cold Drinks & Refreshers",
    "supplier": "bardali"
  },
  {
    "name": "Real Juice (Glass)",
    "price": 335,
    "category": "Cold Drinks & Refreshers",
    "supplier": "bardali"
  },
  {
    "name": "Sprite",
    "price": 60,
    "category": "Cold Drinks & Refreshers",
    "supplier": "chillpill"
  },
  {
    "name": "Sweet Lassi",
    "price": 145,
    "category": "Cold Drinks & Refreshers",
    "supplier": "bros_burger"
  },
  {
    "name": "Water",
    "price": 30,
    "category": "Cold Drinks & Refreshers",
    "supplier": "chillpill"
  },
  {
    "name": "Aloo Patty Burger",
    "price": 300,
    "category": "Burgers & Wraps",
    "supplier": "bros_burger"
  },
  {
    "name": "Chicken Wrap",
    "price": 195,
    "category": "Burgers & Wraps",
    "supplier": "bros_burger"
  },
  {
    "name": "Classic Chicken Burger",
    "price": 355,
    "category": "Burgers & Wraps",
    "supplier": "bros_burger"
  },
  {
    "name": "Crispy Chicken Burger",
    "price": 485,
    "category": "Burgers & Wraps",
    "supplier": "bros_burger"
  },
  {
    "name": "Double Decker Buff Burger",
    "price": 675,
    "category": "Burgers & Wraps",
    "supplier": "bros_burger"
  },
  {
    "name": "Double Decker Chicken Burger",
    "price": 675,
    "category": "Burgers & Wraps",
    "supplier": "bros_burger"
  },
  {
    "name": "Grilled Chicken Burger",
    "price": 425,
    "category": "Burgers & Wraps",
    "supplier": "bros_burger"
  },
  {
    "name": "Smashed Cheese Burger",
    "price": 435,
    "category": "Burgers & Wraps",
    "supplier": "bros_burger"
  },
  {
    "name": "Thakali Burger",
    "price": 395,
    "category": "Burgers & Wraps",
    "supplier": "bros_burger"
  },
  {
    "name": "Veg Wrap",
    "price": 185,
    "category": "Burgers & Wraps",
    "supplier": "bros_burger"
  },
  {
    "name": "Veggie Burger",
    "price": 325,
    "category": "Burgers & Wraps",
    "supplier": "bros_burger"
  },
  {
    "name": "Chicken Chaila Pizza",
    "price": 715,
    "category": "Pizza",
    "supplier": "bardali"
  },
  {
    "name": "Margherita Pizza",
    "price": 595,
    "category": "Pizza",
    "supplier": "bardali"
  },
  {
    "name": "Smoke Chicken Pizza",
    "price": 750,
    "category": "Pizza",
    "supplier": "bardali"
  },
  {
    "name": "Belgian Fries",
    "price": 225,
    "category": "Fries & Snacks",
    "supplier": "bros_burger"
  },
  {
    "name": "Buffalo Wings (3 pcs)",
    "price": 365,
    "category": "Fries & Snacks",
    "supplier": "bros_burger"
  },
  {
    "name": "Cheese Fries",
    "price": 265,
    "category": "Fries & Snacks",
    "supplier": "bros_burger"
  },
  {
    "name": "Chicken 65",
    "price": 285,
    "category": "Fries & Snacks",
    "supplier": "bros_burger"
  },
  {
    "name": "Chicken Chilly",
    "price": 450,
    "category": "Fries & Snacks",
    "supplier": "bardali"
  },
  {
    "name": "Chicken Lolly",
    "price": 420,
    "category": "Fries & Snacks",
    "supplier": "bardali"
  },
  {
    "name": "Chicken Nuggets",
    "price": 300,
    "category": "Fries & Snacks",
    "supplier": "bardali"
  },
  {
    "name": "Chicken Pakoda",
    "price": 320,
    "category": "Fries & Snacks",
    "supplier": "bros_burger"
  },
  {
    "name": "Chicken Ring",
    "price": 265,
    "category": "Fries & Snacks",
    "supplier": "bros_burger"
  },
  {
    "name": "Chips Chilly",
    "price": 255,
    "category": "Fries & Snacks",
    "supplier": "bros_burger"
  },
  {
    "name": "Crunchy Fried Chicken (4 pcs)",
    "price": 475,
    "category": "Fries & Snacks",
    "supplier": "bros_burger"
  },
  {
    "name": "Crunchy Fried Chicken (6 pcs)",
    "price": 800,
    "category": "Fries & Snacks",
    "supplier": "bros_burger"
  },
  {
    "name": "French Fries",
    "price": 165,
    "category": "Fries & Snacks",
    "supplier": "bros_burger"
  },
  {
    "name": "Kaju Chicken",
    "price": 475,
    "category": "Fries & Snacks",
    "supplier": "bardali"
  },
  {
    "name": "Loaded Fries",
    "price": 365,
    "category": "Fries & Snacks",
    "supplier": "bros_burger"
  },
  {
    "name": "Masala Fries",
    "price": 295,
    "category": "Fries & Snacks",
    "supplier": "bardali"
  },
  {
    "name": "Mustang Aloo",
    "price": 180,
    "category": "Fries & Snacks",
    "supplier": "bros_burger"
  },
  {
    "name": "Onion Ring",
    "price": 160,
    "category": "Fries & Snacks",
    "supplier": "bros_burger"
  },
  {
    "name": "Paneer Chilly",
    "price": 450,
    "category": "Fries & Snacks",
    "supplier": "bardali"
  },
  {
    "name": "Pangra Fry",
    "price": 450,
    "category": "Fries & Snacks",
    "supplier": "bardali"
  },
  {
    "name": "Parmesan Chicken",
    "price": 455,
    "category": "Fries & Snacks",
    "supplier": "bros_burger"
  },
  {
    "name": "Popcorn Chicken",
    "price": 300,
    "category": "Fries & Snacks",
    "supplier": "bros_burger"
  },
  {
    "name": "Pork Chilly",
    "price": 475,
    "category": "Fries & Snacks",
    "supplier": "bardali"
  },
  {
    "name": "Sausage Chilly",
    "price": 255,
    "category": "Fries & Snacks",
    "supplier": "bros_burger"
  },
  {
    "name": "Spicy Wings (6 pcs)",
    "price": 395,
    "category": "Fries & Snacks",
    "supplier": "bros_burger"
  },
  {
    "name": "Timur Chicken",
    "price": 295,
    "category": "Fries & Snacks",
    "supplier": "bros_burger"
  },
  {
    "name": "Bhatmas / Peanuts",
    "price": 270,
    "category": "Sadheko & Choila",
    "supplier": "bardali"
  },
  {
    "name": "Chatpate",
    "price": 125,
    "category": "Sadheko & Choila",
    "supplier": "bros_burger"
  },
  {
    "name": "Chau Chau Sadheko",
    "price": 145,
    "category": "Sadheko & Choila",
    "supplier": "bros_burger"
  },
  {
    "name": "Chicken Chau Chau Sadheko",
    "price": 250,
    "category": "Sadheko & Choila",
    "supplier": "bros_burger"
  },
  {
    "name": "Chicken Sadheko",
    "price": 300,
    "category": "Sadheko & Choila",
    "supplier": "bros_burger"
  },
  {
    "name": "Corn Sadheko",
    "price": 295,
    "category": "Sadheko & Choila",
    "supplier": "bardali"
  },
  {
    "name": "Hariyo Bhatmas",
    "price": 295,
    "category": "Sadheko & Choila",
    "supplier": "bardali"
  },
  {
    "name": "Machha Sadheko",
    "price": 510,
    "category": "Sadheko & Choila",
    "supplier": "bardali"
  },
  {
    "name": "Mushroom Choila",
    "price": 415,
    "category": "Sadheko & Choila",
    "supplier": "bardali"
  },
  {
    "name": "Mushroom Sadheko",
    "price": 390,
    "category": "Sadheko & Choila",
    "supplier": "bardali"
  },
  {
    "name": "Buff Chilly Momo",
    "price": 300,
    "category": "Momo",
    "supplier": "bardali"
  },
  {
    "name": "Buff Fry Momo",
    "price": 270,
    "category": "Momo",
    "supplier": "bardali"
  },
  {
    "name": "Buff Kothey Momo",
    "price": 270,
    "category": "Momo",
    "supplier": "bardali"
  },
  {
    "name": "Buff Steam Momo",
    "price": 235,
    "category": "Momo",
    "supplier": "bardali"
  },
  {
    "name": "Chicken Chilly Momo",
    "price": 295,
    "category": "Momo",
    "supplier": "bros_burger"
  },
  {
    "name": "Chicken Choila Momo",
    "price": 290,
    "category": "Momo",
    "supplier": "bros_burger"
  },
  {
    "name": "Chicken Crispy Momo",
    "price": 305,
    "category": "Momo",
    "supplier": "bros_burger"
  },
  {
    "name": "Chicken Jhol Momo",
    "price": 205,
    "category": "Momo",
    "supplier": "bros_burger"
  },
  {
    "name": "Chicken Kothey Momo",
    "price": 270,
    "category": "Momo",
    "supplier": "bardali"
  },
  {
    "name": "Chicken Soup Momo",
    "price": 255,
    "category": "Momo",
    "supplier": "bros_burger"
  },
  {
    "name": "Chicken Steam Momo",
    "price": 195,
    "category": "Momo",
    "supplier": "bros_burger"
  },
  {
    "name": "Veg Chilly Momo",
    "price": 270,
    "category": "Momo",
    "supplier": "bardali"
  },
  {
    "name": "Veg Fry Momo",
    "price": 240,
    "category": "Momo",
    "supplier": "bardali"
  },
  {
    "name": "Veg Kothey Momo",
    "price": 240,
    "category": "Momo",
    "supplier": "bardali"
  },
  {
    "name": "Veg Steam Momo",
    "price": 210,
    "category": "Momo",
    "supplier": "bardali"
  },
  {
    "name": "Buff Chowmein",
    "price": 245,
    "category": "Noodles, Thukpa & Rice",
    "supplier": "bros_burger"
  },
  {
    "name": "Buff Fried Rice",
    "price": 250,
    "category": "Noodles, Thukpa & Rice",
    "supplier": "bros_burger"
  },
  {
    "name": "Buff Keema Noodles",
    "price": 265,
    "category": "Noodles, Thukpa & Rice",
    "supplier": "bros_burger"
  },
  {
    "name": "Buff Thukpa",
    "price": 235,
    "category": "Noodles, Thukpa & Rice",
    "supplier": "bros_burger"
  },
  {
    "name": "Chicken Biryani",
    "price": 570,
    "category": "Noodles, Thukpa & Rice",
    "supplier": "bardali"
  },
  {
    "name": "Chicken Chowmein",
    "price": 255,
    "category": "Noodles, Thukpa & Rice",
    "supplier": "bros_burger"
  },
  {
    "name": "Chicken Current Noodles",
    "price": 185,
    "category": "Noodles, Thukpa & Rice",
    "supplier": "bros_burger"
  },
  {
    "name": "Chicken Fried Rice",
    "price": 265,
    "category": "Noodles, Thukpa & Rice",
    "supplier": "bros_burger"
  },
  {
    "name": "Chicken Keema Noodles",
    "price": 245,
    "category": "Noodles, Thukpa & Rice",
    "supplier": "bros_burger"
  },
  {
    "name": "Chicken Thukpa",
    "price": 255,
    "category": "Noodles, Thukpa & Rice",
    "supplier": "bros_burger"
  },
  {
    "name": "Dragon Chicken with Rice",
    "price": 325,
    "category": "Noodles, Thukpa & Rice",
    "supplier": "bros_burger"
  },
  {
    "name": "Egg Current Noodles",
    "price": 155,
    "category": "Noodles, Thukpa & Rice",
    "supplier": "bros_burger"
  },
  {
    "name": "Egg Fried Rice",
    "price": 195,
    "category": "Noodles, Thukpa & Rice",
    "supplier": "bros_burger"
  },
  {
    "name": "Mix Chowmein",
    "price": 390,
    "category": "Noodles, Thukpa & Rice",
    "supplier": "bardali"
  },
  {
    "name": "Mixed Fried Rice",
    "price": 295,
    "category": "Noodles, Thukpa & Rice",
    "supplier": "bros_burger"
  },
  {
    "name": "Veg Biryani",
    "price": 510,
    "category": "Noodles, Thukpa & Rice",
    "supplier": "bardali"
  },
  {
    "name": "Veg Chowmein",
    "price": 185,
    "category": "Noodles, Thukpa & Rice",
    "supplier": "bros_burger"
  },
  {
    "name": "Veg Current Noodles",
    "price": 125,
    "category": "Noodles, Thukpa & Rice",
    "supplier": "bros_burger"
  },
  {
    "name": "Veg Fried Rice",
    "price": 170,
    "category": "Noodles, Thukpa & Rice",
    "supplier": "bros_burger"
  },
  {
    "name": "Veg Thukpa",
    "price": 195,
    "category": "Noodles, Thukpa & Rice",
    "supplier": "bros_burger"
  },
  {
    "name": "Cheese Fries & Coke",
    "price": 345,
    "category": "Combos",
    "supplier": "bros_burger"
  },
  {
    "name": "Chicken Wrap, Classic Chicken Burger, French Fries & Coke",
    "price": 775,
    "category": "Combos",
    "supplier": "bros_burger"
  },
  {
    "name": "Choila Momo, Spicy Wings & 2 Cokes",
    "price": 845,
    "category": "Combos",
    "supplier": "bros_burger"
  },
  {
    "name": "Veg Wrap, Veggie Burger, French Fries & Coke",
    "price": 735,
    "category": "Combos",
    "supplier": "bros_burger"
  },
  {
    "name": "Bardali Platter",
    "price": 1435,
    "category": "Thali & Platters",
    "supplier": "bardali"
  },
  {
    "name": "Chicken Thali Set",
    "price": 540,
    "category": "Thali & Platters",
    "supplier": "bardali"
  },
  {
    "name": "Local Chicken Thali Set",
    "price": 660,
    "category": "Thali & Platters",
    "supplier": "bardali"
  },
  {
    "name": "Mutton Thali Set",
    "price": 660,
    "category": "Thali & Platters",
    "supplier": "bardali"
  },
  {
    "name": "Paneer Thali Set",
    "price": 540,
    "category": "Thali & Platters",
    "supplier": "bardali"
  },
  {
    "name": "Sekuwa Platter (Mutton / Chicken / Pork)",
    "price": 1795,
    "category": "Thali & Platters",
    "supplier": "bardali"
  },
  {
    "name": "Veg Thali Set",
    "price": 420,
    "category": "Thali & Platters",
    "supplier": "bardali"
  },
  {
    "name": "Chicken Sekuwa Jhaneko",
    "price": 520,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Chicken Sekuwa With Bone (250g)",
    "price": 500,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Chicken Sekuwa With Bone (Full)",
    "price": 1800,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Chicken Sekuwa With Bone (Half)",
    "price": 1020,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Chicken Sekuwa With Bone (Set)",
    "price": 390,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Mutton Sekuwa (250g)",
    "price": 1020,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Mutton Sekuwa (Full)",
    "price": 3600,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Mutton Sekuwa (Half)",
    "price": 1920,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Mutton Sekuwa (Set)",
    "price": 625,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Mutton Sekuwa Jhaneko",
    "price": 660,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Paneer Sekuwa (250g)",
    "price": 540,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Paneer Sekuwa (Full)",
    "price": 1800,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Paneer Sekuwa (Half)",
    "price": 1020,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Paneer Sekuwa (Set)",
    "price": 450,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Pangra Sekuwa (250g)",
    "price": 540,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Pangra Sekuwa (Full)",
    "price": 1920,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Pangra Sekuwa (Half)",
    "price": 1020,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Pangra Sekuwa (Set)",
    "price": 450,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Pork Sekuwa (250g)",
    "price": 510,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Pork Sekuwa (Full)",
    "price": 1920,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Pork Sekuwa (Half)",
    "price": 1050,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Pork Sekuwa (Set)",
    "price": 415,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Wings Sekuwa (Full)",
    "price": 1920,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Wings Sekuwa (Half)",
    "price": 1020,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Wings Sekuwa (Set)",
    "price": 510,
    "category": "Sekuwa",
    "supplier": "bardali"
  },
  {
    "name": "Aalu Poleko",
    "price": 210,
    "category": "Nepali Specialties",
    "supplier": "bardali"
  },
  {
    "name": "Bhuja Set",
    "price": 90,
    "category": "Nepali Specialties",
    "supplier": "bardali"
  },
  {
    "name": "Bhutan",
    "price": 420,
    "category": "Nepali Specialties",
    "supplier": "bardali"
  },
  {
    "name": "Butwal Saag Sukuti",
    "price": 500,
    "category": "Nepali Specialties",
    "supplier": "bardali"
  },
  {
    "name": "Chicken Mole Poleko",
    "price": 540,
    "category": "Nepali Specialties",
    "supplier": "bardali"
  },
  {
    "name": "Dharane Sukuti",
    "price": 540,
    "category": "Nepali Specialties",
    "supplier": "bardali"
  },
  {
    "name": "Hyakula (Damaka / Poleko / Timmure)",
    "price": 595,
    "category": "Nepali Specialties",
    "supplier": "bardali"
  },
  {
    "name": "Janakpure Tawa Machha",
    "price": 570,
    "category": "Nepali Specialties",
    "supplier": "bardali"
  },
  {
    "name": "Khasiko Masu Chiura",
    "price": 595,
    "category": "Nepali Specialties",
    "supplier": "bardali"
  },
  {
    "name": "Lasun Poleko",
    "price": 210,
    "category": "Nepali Specialties",
    "supplier": "bardali"
  },
  {
    "name": "Local Vale Masu Chiura",
    "price": 595,
    "category": "Nepali Specialties",
    "supplier": "bardali"
  },
  {
    "name": "Pork Mole Poleko",
    "price": 540,
    "category": "Nepali Specialties",
    "supplier": "bardali"
  },
  {
    "name": "Rajkhani Poleko",
    "price": 535,
    "category": "Nepali Specialties",
    "supplier": "bardali"
  },
  {
    "name": "Sausage Fry / Poleko",
    "price": 475,
    "category": "Nepali Specialties",
    "supplier": "bardali"
  },
  {
    "name": "Tauko (Sadheko / Fry / Boil)",
    "price": 475,
    "category": "Nepali Specialties",
    "supplier": "bardali"
  },
  {
    "name": "Timmure Aalu",
    "price": 295,
    "category": "Nepali Specialties",
    "supplier": "bardali"
  },
  {
    "name": "Timmure Pork Slice",
    "price": 475,
    "category": "Nepali Specialties",
    "supplier": "bardali"
  },
  {
    "name": "Timmure Wings",
    "price": 475,
    "category": "Nepali Specialties",
    "supplier": "bardali"
  },
  {
    "name": "Twakka Aaloo",
    "price": 295,
    "category": "Nepali Specialties",
    "supplier": "bardali"
  },
  {
    "name": "Whole Grilled Fish",
    "price": 900,
    "category": "Nepali Specialties",
    "supplier": "bardali"
  },
  {
    "name": "Chicken Salad",
    "price": 395,
    "category": "Salads & Soups",
    "supplier": "bros_burger"
  },
  {
    "name": "Chicken Soup",
    "price": 270,
    "category": "Salads & Soups",
    "supplier": "bardali"
  },
  {
    "name": "Green Salad",
    "price": 210,
    "category": "Salads & Soups",
    "supplier": "bardali"
  },
  {
    "name": "Hot and Sour Soup (Non-Veg)",
    "price": 330,
    "category": "Salads & Soups",
    "supplier": "bardali"
  },
  {
    "name": "Hot and Sour Soup (Veg)",
    "price": 270,
    "category": "Salads & Soups",
    "supplier": "bardali"
  },
  {
    "name": "Mushroom Soup",
    "price": 210,
    "category": "Salads & Soups",
    "supplier": "bardali"
  },
  {
    "name": "Seasonal Fruits Salad",
    "price": 450,
    "category": "Salads & Soups",
    "supplier": "bardali"
  },
  {
    "name": "Veg Boil",
    "price": 330,
    "category": "Salads & Soups",
    "supplier": "bardali"
  },
  {
    "name": "Barasinghee Hazy IPA",
    "price": 730,
    "category": "Beer & Cider",
    "supplier": "bardali"
  },
  {
    "name": "Barasinghee Pale Ale",
    "price": 720,
    "category": "Beer & Cider",
    "supplier": "bardali"
  },
  {
    "name": "Barasinghee Pilsner",
    "price": 660,
    "category": "Beer & Cider",
    "supplier": "bardali"
  },
  {
    "name": "Barasinghee Pilsner (Tower)",
    "price": 2620,
    "category": "Beer & Cider",
    "supplier": "bardali"
  },
  {
    "name": "Carlsberg",
    "price": 745,
    "category": "Beer & Cider",
    "supplier": "bardali"
  },
  {
    "name": "Gorkha Craft",
    "price": 635,
    "category": "Beer & Cider",
    "supplier": "bardali"
  },
  {
    "name": "Gorkha Pilsner",
    "price": 625,
    "category": "Beer & Cider",
    "supplier": "bardali"
  },
  {
    "name": "Gorkha Pilsner (Tower)",
    "price": 2495,
    "category": "Beer & Cider",
    "supplier": "bardali"
  },
  {
    "name": "Gorkha Strong",
    "price": 600,
    "category": "Beer & Cider",
    "supplier": "bardali"
  },
  {
    "name": "Ruslan Cooler",
    "price": 325,
    "category": "Beer & Cider",
    "supplier": "bardali"
  },
  {
    "name": "Sherpa Draught IPA (1.5 L Pitcher)",
    "price": 2160,
    "category": "Beer & Cider",
    "supplier": "bardali"
  },
  {
    "name": "Sherpa Draught IPA (500 ml)",
    "price": 720,
    "category": "Beer & Cider",
    "supplier": "bardali"
  },
  {
    "name": "Sherpa Draught Kolsh (1.5 L Pitcher)",
    "price": 1980,
    "category": "Beer & Cider",
    "supplier": "bardali"
  },
  {
    "name": "Sherpa Draught Kolsh (500 ml)",
    "price": 660,
    "category": "Beer & Cider",
    "supplier": "bardali"
  },
  {
    "name": "Sherpa Draught Red (1.5 L Pitcher)",
    "price": 1980,
    "category": "Beer & Cider",
    "supplier": "bardali"
  },
  {
    "name": "Sherpa Draught Red (500 ml)",
    "price": 660,
    "category": "Beer & Cider",
    "supplier": "bardali"
  },
  {
    "name": "Tuborg",
    "price": 660,
    "category": "Beer & Cider",
    "supplier": "bardali"
  },
  {
    "name": "Tuborg (Tower)",
    "price": 2640,
    "category": "Beer & Cider",
    "supplier": "bardali"
  },
  {
    "name": "Jacob's Creek Merlot Shiraz",
    "price": 3360,
    "category": "Wine",
    "supplier": "bardali"
  },
  {
    "name": "Jacob's Creek Moscato",
    "price": 3360,
    "category": "Wine",
    "supplier": "bardali"
  },
  {
    "name": "Robertson Sweet Red",
    "price": 2640,
    "category": "Wine",
    "supplier": "bardali"
  },
  {
    "name": "Robertson Sweet White",
    "price": 2640,
    "category": "Wine",
    "supplier": "bardali"
  },
  {
    "name": "8848 Vodka (60 ml)",
    "price": 395,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "8848 Vodka (Full)",
    "price": 3520,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "8848 Vodka (Half)",
    "price": 1765,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "8848 Vodka (Quarter)",
    "price": 880,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Absolut Vodka (60 ml)",
    "price": 720,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Absolut Vodka (Full)",
    "price": 10255,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Absolut Vodka (Half)",
    "price": 5130,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Absolut Vodka (Quarter)",
    "price": 2570,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Beefeater Gin (60 ml)",
    "price": 755,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Beefeater Gin (Full)",
    "price": 10510,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Beefeater Gin (Half)",
    "price": 5255,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Beefeater Gin (Quarter)",
    "price": 2630,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Chivas (60 ml)",
    "price": 1030,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Chivas (Full)",
    "price": 14330,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Chivas (Half)",
    "price": 7165,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Chivas (Quarter)",
    "price": 3580,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Gurkhas N Guns Whisky (60 ml)",
    "price": 470,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Gurkhas N Guns Whisky (Full)",
    "price": 4680,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Gurkhas N Guns Whisky (Half)",
    "price": 2340,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Gurkhas N Guns Whisky (Quarter)",
    "price": 1170,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Himalayan Reserve Whisky (60 ml)",
    "price": 540,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Himalayan Reserve Whisky (Full)",
    "price": 5400,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Himalayan Reserve Whisky (Half)",
    "price": 2700,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Himalayan Reserve Whisky (Quarter)",
    "price": 1350,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Jack Daniels (60 ml)",
    "price": 910,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Jack Daniels (Full)",
    "price": 12670,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Jack Daniels (Half)",
    "price": 6335,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Jack Daniels (Quarter)",
    "price": 3170,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Jameson (60 ml)",
    "price": 850,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Jameson (Full)",
    "price": 11880,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Jameson (Half)",
    "price": 5940,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Jameson (Quarter)",
    "price": 2970,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Junge Kaji Rum (60 ml)",
    "price": 300,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Junge Kaji Rum (Full)",
    "price": 3025,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Junge Kaji Rum (Half)",
    "price": 1510,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Junge Kaji Rum (Quarter)",
    "price": 755,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "JW Black Label (12 yrs.) (60 ml)",
    "price": 1030,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "JW Black Label (12 yrs.) (Full)",
    "price": 14330,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "JW Black Label (12 yrs.) (Half)",
    "price": 7165,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "JW Black Label (12 yrs.) (Quarter)",
    "price": 3580,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "JW Double Black (60 ml)",
    "price": 1235,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "JW Double Black (Full)",
    "price": 17135,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "JW Double Black (Half)",
    "price": 8570,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "JW Double Black (Quarter)",
    "price": 4285,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Kalapatthar Whisky (60 ml)",
    "price": 445,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Kalapatthar Whisky (Full)",
    "price": 4405,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Kalapatthar Whisky (Half)",
    "price": 2200,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Kalapatthar Whisky (Quarter)",
    "price": 1105,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Khukuri Rum (60 ml)",
    "price": 330,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Khukuri Rum (Quarter)",
    "price": 830,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Nude Vodka (60 ml)",
    "price": 340,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Nude Vodka (Full)",
    "price": 3420,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Nude Vodka (Half)",
    "price": 1710,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Nude Vodka (Quarter)",
    "price": 860,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Old Durbar Whisky (60 ml)",
    "price": 455,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Old Durbar Whisky (Full)",
    "price": 4530,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Old Durbar Whisky (Half)",
    "price": 2270,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Old Durbar Whisky (Quarter)",
    "price": 1135,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Olmeca Tequila (1 shot)",
    "price": 630,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Olmeca Tequila (Bottle)",
    "price": 10200,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Ruslan Vodka (60 ml)",
    "price": 350,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Ruslan Vodka (Full)",
    "price": 3455,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Ruslan Vodka (Half)",
    "price": 1730,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Ruslan Vodka (Quarter)",
    "price": 865,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Setobagh Vodka (60 ml)",
    "price": 330,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Setobagh Vodka (Full)",
    "price": 3300,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Setobagh Vodka (Half)",
    "price": 1650,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Setobagh Vodka (Quarter)",
    "price": 830,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "The Glenlivet (12 yrs.) (60 ml)",
    "price": 1535,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "The Glenlivet (12 yrs.) (Full)",
    "price": 21360,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "The Glenlivet (12 yrs.) (Half)",
    "price": 10680,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "The Glenlivet (12 yrs.) (Quarter)",
    "price": 5340,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Yeti Vodka (60 ml)",
    "price": 340,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Yeti Vodka (Full)",
    "price": 3395,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Yeti Vodka (Half)",
    "price": 1700,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Yeti Vodka (Quarter)",
    "price": 850,
    "category": "Spirits",
    "supplier": "bardali"
  },
  {
    "name": "Cloud Hookah (Apple / Paan Ras / Mint / Blueberry)",
    "price": 660,
    "category": "Hookah",
    "supplier": "bardali"
  },
  {
    "name": "Hookah Extra Coil",
    "price": 120,
    "category": "Hookah",
    "supplier": "bardali"
  },
  {
    "name": "Premium Flavours Hookah (Ladykiller / Ice Mango / Love 66)",
    "price": 900,
    "category": "Hookah",
    "supplier": "bardali"
  }
];

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = REVISED_MENU_ITEMS;
  }
  if (root) {
    root.REVISED_MENU_ITEMS = REVISED_MENU_ITEMS;
  }
})(typeof window !== 'undefined' ? window : globalThis);
