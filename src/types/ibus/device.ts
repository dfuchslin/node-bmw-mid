import { FullIbusMessage } from '.';
import { IbusInterface } from '../../lib/ibus';

/* from https://github.com/kmalinich/node-bmw-interface */
export enum IbusDeviceId {
  ABG = 0xa4, // Airbag
  AHL = 0x66, // Adaptive headlight unit
  ANZV = 0xe7, // Display group
  ASC = 0x56, // Anti-lock braking system with ASC
  ASST = 0xca, // BMW Assist
  BMBT = 0xf0, // On board monitor control panel
  CCM = 0x30, // Check control messages
  CDC = 0x18, // CD changer
  CDCD = 0x76, // CD changer (DIN size)
  CID = 0x46, // Center information display
  CSU = 0xf5, // Centre switch control unit
  CVM = 0x52, // Cabrio folding top module
  DIA = 0x3f, // Diagnostic
  DME = 0x12, // Digital Motor Electronics
  DMEK = 0xb8, // DME (K2000 protocol)
  DSP = 0x6a, // Digital sound processor amplifier
  DSPC = 0xea, // Digital sound processor controller
  EGS = 0x32, // Electronic gearbox control
  EHC = 0xac, // Electronic height control
  EKM = 0x02, // Electronic body module
  EKP = 0x65, // Electronic fuel pump
  EWS = 0x44, // EWS immobilizer
  FBZV = 0x40, // Key fob (only older E38)
  FHK = 0xa7, // Automatic climate control, rear
  FID = 0xa0, // Multi-information display, rear
  FMBT = 0x47, // Rear monitor controls
  GLO = 0xbf, // Global
  GM = 0x00, // General module
  GR = 0xa6, // Cruise control
  GT = 0x3b, // Navigation
  GTF = 0x43, // Navigation, rear
  HAC = 0x9a, // Headlight aim control
  HKM = 0x24, // Boot lid control unit
  IHKA = 0x5b, // Automatic climate control
  IKE = 0x80, // Cluster
  IRIS = 0xe0, // Integrated radio information system
  LCM = 0xd0, // Light/check module
  LOC = 0xff, // Local
  LWS = 0x57, // Steering angle sensor
  MFL = 0x50, // Multi function lever
  MID = 0xc0, // Multi-information display
  MM3 = 0x9c, // Mirror memory 3
  MML = 0x51, // Mirror memory, left
  MMR = 0x9b, // Mirror memory, right
  NAVC = 0xa8, // Navigation China
  NAVE = 0x7f, // Navigation Europe
  NAVJ = 0xbb, // Navigation Japan
  PDC = 0x60, // Park distance control
  PIC = 0xf1, // Programmable controller (custom unit)
  RAD = 0x68, // Radio
  RCC = 0x28, // Radio controlled clock
  RCSC = 0x81, // Revolution counter/steering column
  RDC = 0x70, // Tire pressure control
  RLS = 0xe8, // Rain/light sensor
  SDRS = 0x73, // Sirius sat radio
  SES = 0xb0, // Handfree/speech input
  SHD = 0x08, // Sunroof module
  SM = 0x72, // Seat memory
  SMAD = 0xda, // Seat memory assistant driver
  SOR = 0x74, // Seat occupancy recognition unit
  STH = 0x6b, // Standing heat
  TCU = 0xca, // Telematics control unit
  TEL = 0xc8, // Telephone
  VID = 0xed, // Video input/TV tuner
}

export interface Device {
  id: typeof IbusDeviceId[keyof typeof IbusDeviceId];
  init(ibusInterface: IbusInterface): void;
  term(): void;
  parseMessage(message: FullIbusMessage): void;
}
