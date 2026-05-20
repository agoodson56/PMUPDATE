-- 0002: Seed labor_manual with industry-standard installation hours
-- per unit for common low-voltage / structured cabling / AV / security
-- materials. Values are derived from BICSI labor units and NECA Manual
-- of Labor Units for an average crew under normal conditions and should
-- be tuned per project / region / installer skill.
--
-- Patterns are matched against BOM line items by normalized substring
-- (case-insensitive, non-alphanumerics stripped). Longer / more specific
-- patterns win over shorter ones, so "Cat 6A Patch Cord" beats "Cable".
--
-- Hours are decimal hours per unit (0.05 = 3 minutes; 1.5 = 1 h 30 min).

INSERT OR IGNORE INTO labor_manual (material_pattern, hours_per_unit, category, notes) VALUES
  -- Copper cabling (per foot pulled)
  ('Cat5e UTP Cable',                0.010, 'Cabling', 'Pulled in pathway, no termination'),
  ('Cat6 UTP Cable',                 0.012, 'Cabling', 'Pulled in pathway, no termination'),
  ('Cat6A UTP Cable',                0.015, 'Cabling', 'Heavier OD; pulled in pathway'),
  ('Cat6A STP Cable',                0.018, 'Cabling', 'Shielded; takes longer to pull'),
  ('Plenum Cable',                   0.013, 'Cabling', 'Plenum-rated copper, per foot'),

  -- Fiber cabling (per foot)
  ('Fiber SM',                       0.020, 'Fiber',   'Single-mode pulled, per foot'),
  ('Fiber MM',                       0.020, 'Fiber',   'Multimode pulled, per foot'),
  ('Fiber OS2',                      0.020, 'Fiber',   'OS2 single-mode pulled, per foot'),
  ('Fiber OM4',                      0.020, 'Fiber',   'OM4 multimode pulled, per foot'),

  -- Terminations / patch cords
  ('Keystone Jack',                  0.25,  'Termination', 'Terminate + test single jack'),
  ('RJ45 Jack',                      0.25,  'Termination', 'Terminate + test single jack'),
  ('Cat 6A Jack',                    0.30,  'Termination', 'Cat6A field termination'),
  ('Faceplate',                      0.15,  'Termination', 'Snap-in faceplate, no jacks'),
  ('Patch Cord',                     0.05,  'Termination', 'Factory cord, dress + label'),
  ('Fiber Splice',                   0.50,  'Fiber',       'Fusion splice + tray, per splice'),
  ('Fiber Connector',                0.40,  'Fiber',       'Field-installed connector'),
  ('LC Connector',                   0.40,  'Fiber',       'Field LC connector'),
  ('SC Connector',                   0.40,  'Fiber',       'Field SC connector'),
  ('Fiber Splice Tray',              0.20,  'Fiber',       'Tray mount only'),

  -- Pathway / support
  ('EMT Conduit',                    0.05,  'Pathway',     'Per foot, 1/2" - 3/4" runs'),
  ('J-Hook',                         0.10,  'Pathway',     'Install + dress per hook'),
  ('Cable Tray',                     0.20,  'Pathway',     'Per linear foot installed'),
  ('Velcro Cable Ties',              0.001, 'Pathway',     'Wrap per tie (lot-based)'),
  ('Cable Labels',                   0.05,  'Termination', 'Apply + verify per label'),

  -- Cameras (per unit, mount + cable terminate + configure)
  ('Dome Camera',                    2.0,   'CCTV',        'Standard fixed dome'),
  ('Varifocal Dome',                 2.0,   'CCTV',        'Standard varifocal dome'),
  ('Indoor Dome Camera',             1.5,   'CCTV',        'Indoor fixed dome'),
  ('Panoramic Dome',                 3.0,   'CCTV',        'Multi-sensor panoramic'),
  ('Panoramic Dual Lens',            3.0,   'CCTV',        'Dual-lens panoramic'),
  ('Multi-Lens Dome',                3.5,   'CCTV',        '360 multi-sensor dome'),
  ('PTZ Camera',                     3.5,   'CCTV',        'PTZ outdoor'),
  ('Bullet Camera',                  1.75,  'CCTV',        'Bullet/cylinder camera'),

  -- Mounts / brackets
  ('Camera Pole',                    0.75,  'CCTV',        'Pole/wall mount bracket'),
  ('Camera Mount',                   0.50,  'CCTV',        'Surface / pendant mount'),
  ('Wall Mount Bracket',             0.50,  'CCTV',        'Generic wall mount'),

  -- Network / power gear (per unit)
  ('Network Switch',                 1.5,   'Network',     'Rack-mount switch, basic'),
  ('PoE Switch',                     1.5,   'Network',     'PoE switch, rack-mount'),
  ('48-Port Switch',                 2.0,   'Network',     '48-port rack switch'),
  ('24-Port Switch',                 1.5,   'Network',     '24-port rack switch'),
  ('Patch Panel',                    1.0,   'Network',     '24/48-port patch panel'),
  ('UPS',                            1.5,   'Power',       'Rack-mount UPS install/wire'),
  ('Rack Mount UPS',                 1.5,   'Power',       'Rack-mount UPS install/wire'),
  ('PDU',                            0.75,  'Power',       'Rack PDU install/wire'),
  ('Managed PDU',                    1.0,   'Power',       'Managed/metered PDU'),
  ('PoE Surge Protector',            0.5,   'Network',     'In-line PoE surge'),
  ('Surge Protector',                0.5,   'Power',       'Generic in-line surge'),

  -- Servers / storage
  ('Storage Server',                 4.0,   'Server',      'Rack-mount NVR/server'),
  ('Video Storage Server',           4.0,   'Server',      'NVR/video storage rack server'),
  ('Server',                         3.0,   'Server',      'Generic 1U/2U rack server'),
  ('KVM Console',                    1.0,   'Network',     '1U rack KVM console'),

  -- Other common gear
  ('Ceiling Tile',                   0.10,  'Misc',        'Replacement 2x2 ceiling tile'),
  ('Ground Lug',                     0.10,  'Misc',        'Ground lug crimp + bond'),
  ('Donor Antenna',                  2.5,   'DAS',         'Roof antenna mount + cable'),
  ('Bi-Directional Amplifier',       4.0,   'DAS',         'BDA install + tune'),
  ('BDA',                            4.0,   'DAS',         'BDA install + tune'),
  ('Software License',               0.0,   'License',     'No install labor'),
  ('Enterprise License',             0.0,   'License',     'No install labor'),
  ('Omnicast License',               0.0,   'License',     'No install labor'),

  -- Subcontractor / OFCI items (no labor by our crew)
  ('OFCI',                           0.0,   'OFCI',        'Owner-furnished/contractor-installed; labor in install line'),
  ('Subcontractor',                  0.0,   'Subcontractor', 'Tracked separately'),
  ('Insurance',                      0.0,   'Overhead',    'Project overhead, no labor'),
  ('Permits',                        0.0,   'Overhead',    'Project overhead, no labor'),
  ('Parking',                        0.0,   'Travel',      'Per diem item'),
  ('Per Diem',                       0.0,   'Travel',      'Per diem item'),
  ('Equipment Rental',               0.0,   'Travel',      'Rental, no install labor'),
  ('Contingency',                    0.0,   'Overhead',    'Reserve, no labor'),
  ('Scissor Lift',                   0.0,   'Equipment',   'Equipment rental, no install labor'),
  ('Fluke',                          0.0,   'Equipment',   'Test equipment, no install labor'),
  ('Fiber Splicer',                  0.0,   'Equipment',   'Test equipment, no install labor');
