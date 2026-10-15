/**
 * ========================================================
 * PARK BUDDY - BACKEND SERVER (Node.js + Express)
 * ========================================================
 * This is the backend API server for Park Buddy.
 * It manages parking slot data, calculates fees, and
 * persistently stores all records in a JSON file (parking_data.json).
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Path to our persistent database file
const DATA_FILE = path.join(__dirname, 'parking_data.json');

// Middleware
app.use(cors()); // Allow frontend requests from any origin (e.g. file:// or localhost)
app.use(express.json()); // Parse incoming JSON request bodies
app.use(express.static(__dirname)); // Serve frontend files (index.html, etc.) directly

// Hourly rates for parking fee calculation
const HOURLY_RATES = {
  Car: 5,
  Bike: 2,
  SUV: 8
};

// Default sample data with 12 slots (used on first run or when reset)
const DEFAULT_SLOTS = [
  { id: 1, name: "Slot 01", status: "occupied", driver: "Alex Morgan", vehicle: "NY-8821", type: "Car", hours: 2, fee: 10 },
  { id: 2, name: "Slot 02", status: "reserved", driver: "Sarah Connor", vehicle: "CA-4092", type: "Bike", hours: 3, fee: 6 },
  { id: 3, name: "Slot 03", status: "available", driver: "", vehicle: "", type: "Car", hours: 0, fee: 0 },
  { id: 4, name: "Slot 04", status: "available", driver: "", vehicle: "", type: "Car", hours: 0, fee: 0 },
  { id: 5, name: "Slot 05", status: "occupied", driver: "David Miller", vehicle: "TX-1903", type: "SUV", hours: 4, fee: 32 },
  { id: 6, name: "Slot 06", status: "available", driver: "", vehicle: "", type: "Car", hours: 0, fee: 0 },
  { id: 7, name: "Slot 07", status: "available", driver: "", vehicle: "", type: "Car", hours: 0, fee: 0 },
  { id: 8, name: "Slot 08", status: "reserved", driver: "Emily Watson", vehicle: "FL-5512", type: "Car", hours: 1, fee: 5 },
  { id: 9, name: "Slot 09", status: "available", driver: "", vehicle: "", type: "Car", hours: 0, fee: 0 },
  { id: 10, name: "Slot 10", status: "available", driver: "", vehicle: "", type: "Car", hours: 0, fee: 0 },
  { id: 11, name: "Slot 11", status: "available", driver: "", vehicle: "", type: "Car", hours: 0, fee: 0 },
  { id: 12, name: "Slot 12", status: "available", driver: "", vehicle: "", type: "Car", hours: 0, fee: 0 }
];

/* --------------------------------------------------------
   HELPER FUNCTIONS: READ & WRITE DATA FILE
   -------------------------------------------------------- */

// Reads the parking slots from parking_data.json
function readSlotsData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      // If file doesn't exist, create it with default data
      fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_SLOTS, null, 2), 'utf8');
      return DEFAULT_SLOTS;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error('Error reading data file, using defaults:', error);
    return DEFAULT_SLOTS;
  }
}

// Writes the updated parking slots to parking_data.json
function writeSlotsData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing data file:', error);
    return false;
  }
}

/* --------------------------------------------------------
   API ENDPOINTS
   -------------------------------------------------------- */

// 1. GET /api/slots - Retrieve all 12 slots and summary counts
app.get('/api/slots', (req, res) => {
  const slots = readSlotsData();
  const total = slots.length;
  const available = slots.filter(s => s.status === 'available').length;
  const reserved = slots.filter(s => s.status === 'reserved').length;
  const occupied = slots.filter(s => s.status === 'occupied').length;

  res.json({
    success: true,
    stats: { total, available, reserved, occupied },
    slots: slots
  });
});

// 2. POST /api/slots/book - Book or reserve a parking slot
app.post('/api/slots/book', (req, res) => {
  const { slotId, driver, vehicle, type, hours, actionType } = req.body;

  // Validation
  if (!slotId || !driver || !vehicle || !type || !hours) {
    return res.status(400).json({ 
      success: false, 
      message: 'All fields (slotId, driver, vehicle, type, hours) are required.' 
    });
  }

  const parsedHours = parseInt(hours, 10);
  if (isNaN(parsedHours) || parsedHours < 1) {
    return res.status(400).json({ 
      success: false, 
      message: 'Duration must be at least 1 hour.' 
    });
  }

  const slots = readSlotsData();
  const slotIndex = slots.findIndex(s => s.id === parseInt(slotId, 10));

  if (slotIndex === -1) {
    return res.status(404).json({ success: false, message: 'Parking slot not found.' });
  }

  const targetSlot = slots[slotIndex];
  if (targetSlot.status !== 'available') {
    return res.status(400).json({ 
      success: false, 
      message: `Slot ${targetSlot.name} is already ${targetSlot.status}. Please select an available slot.` 
    });
  }

  // Calculate fee
  const rate = HOURLY_RATES[type] || 5;
  const fee = rate * parsedHours;

  // Decide status: "checkin" books immediately as occupied, otherwise reserved
  const newStatus = (actionType === 'checkin') ? 'occupied' : 'reserved';

  // Update slot data
  targetSlot.status = newStatus;
  targetSlot.driver = driver.trim();
  targetSlot.vehicle = vehicle.trim().toUpperCase();
  targetSlot.type = type;
  targetSlot.hours = parsedHours;
  targetSlot.fee = fee;

  // Save to JSON file
  writeSlotsData(slots);

  res.json({
    success: true,
    message: newStatus === 'occupied' 
      ? `Slot ${targetSlot.name} booked and checked in for ${targetSlot.driver}!` 
      : `Slot ${targetSlot.name} reserved for ${targetSlot.driver}!`,
    slot: targetSlot
  });
});

// 3. POST /api/slots/checkin - Check-in a reserved slot to occupied
app.post('/api/slots/checkin', (req, res) => {
  const { slotId } = req.body;
  const slots = readSlotsData();
  const slot = slots.find(s => s.id === parseInt(slotId, 10));

  if (!slot) {
    return res.status(404).json({ success: false, message: 'Slot not found.' });
  }

  if (slot.status !== 'reserved') {
    return res.status(400).json({ 
      success: false, 
      message: `Only reserved slots can be checked in. Current status: ${slot.status}` 
    });
  }

  slot.status = 'occupied';
  writeSlotsData(slots);

  res.json({
    success: true,
    message: `Vehicle ${slot.vehicle} has checked in to ${slot.name}!`,
    slot: slot
  });
});

// 4. POST /api/slots/checkout - Check-out an occupied slot (frees it back to available)
app.post('/api/slots/checkout', (req, res) => {
  const { slotId } = req.body;
  const slots = readSlotsData();
  const slot = slots.find(s => s.id === parseInt(slotId, 10));

  if (!slot) {
    return res.status(404).json({ success: false, message: 'Slot not found.' });
  }

  if (slot.status !== 'occupied') {
    return res.status(400).json({ 
      success: false, 
      message: `Only occupied slots can be checked out. Current status: ${slot.status}` 
    });
  }

  const previousDetails = {
    name: slot.name,
    driver: slot.driver,
    vehicle: slot.vehicle,
    fee: slot.fee
  };

  // Reset slot to available
  slot.status = 'available';
  slot.driver = '';
  slot.vehicle = '';
  slot.type = 'Car';
  slot.hours = 0;
  slot.fee = 0;

  writeSlotsData(slots);

  res.json({
    success: true,
    message: `Checkout complete for ${previousDetails.vehicle} (${previousDetails.driver}). Total Fee: $${previousDetails.fee.toFixed(2)}. ${previousDetails.name} is now available!`,
    slot: slot
  });
});

// 5. POST /api/slots/cancel - Cancel a reserved booking
app.post('/api/slots/cancel', (req, res) => {
  const { slotId } = req.body;
  const slots = readSlotsData();
  const slot = slots.find(s => s.id === parseInt(slotId, 10));

  if (!slot) {
    return res.status(404).json({ success: false, message: 'Slot not found.' });
  }

  const slotName = slot.name;

  // Reset to available
  slot.status = 'available';
  slot.driver = '';
  slot.vehicle = '';
  slot.type = 'Car';
  slot.hours = 0;
  slot.fee = 0;

  writeSlotsData(slots);

  res.json({
    success: true,
    message: `Reservation for ${slotName} was cancelled successfully.`,
    slot: slot
  });
});

// 6. POST /api/slots/reset - Reset slots to default initial sample state
app.post('/api/slots/reset', (req, res) => {
  const freshData = JSON.parse(JSON.stringify(DEFAULT_SLOTS));
  writeSlotsData(freshData);

  res.json({
    success: true,
    message: 'All parking slots have been reset to default sample data.',
    slots: freshData
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚗 Park Buddy Backend Server is running!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`📁 Database: ${DATA_FILE}`);
  console.log(`====================================================`);
});
