# Career Glitch — Data Pass Changelog (28.10.2026)

Проход по данным перед фризом хакатона: заглушки зарплат/сроков (D3/D4),
наследование данных дочерних профессий (D10), фантастические цифры (D6),
прогноз роста BLS (D2), дрейф roadmap-карт (D5).

Источники: BLS Occupational Outlook Handbook (медианы и outlook, страницы
профессий, прочитаны 28.10.2026); BLS Employment Projections, Table 1.2,
2025–35 (процент роста и медианная зарплата 2025 по кодам SOC); O*NET Job
Zones. Формат: профессия · поле · было → стало · источник.

Округление зарплат: до целых $K, как в существующих записях базы.

## D3 — зарплаты-заглушки $75K → медианы BLS

Источник, если не указано иное: BLS OOH, медиана 2025 (страница профессии,
прочитана 28.10.2026); значения сверены с BLS EP Table 1.2 (медианная
зарплата 2025 по SOC) — по всем позициям, кроме отмеченных, оба источника
совпали до доллара.

- no-code-developer · payK · 75 → 93 · OOH Web Developers $92,650
- motion-designer-3d-artist · payK · 75 → 102 · OOH Special Effects Artists and Animators $102,030
- game-designer · payK · 75 → 104 · OOH Web and Digital Interface Designers $104,000
- seo-specialist · payK · 75 → 79 · OOH Market Research Analysts $78,760
- ppc-paid-ads-specialist · payK · 75 → 79 · OOH Market Research Analysts $78,760
- content-strategist · payK · 75 → 78 · OOH Editors $77,920
- copywriter · payK · 75 → 77 · OOH Writers and Authors $76,910
- e-commerce-manager · payK · 75 → 83 · BLS EP Table 1.2, SOC 13-1199 (собственный SOC профессии в базе) $83,050. Примечание: OOH Marketing Managers — $166,790, но это управленческий трек с опытом, не собственная строка профессии.
- brand-strategist · payK · 75 → 79 · OOH Market Research Analysts $78,760
- pr-specialist · payK · 75 → 75 · OOH Public Relations Specialists $74,750 — цифра подтверждена источником, больше не заглушка
- home-stager · payK · 75 → 67 · OOH Interior Designers (SOC профессии 27-1025) $67,190
- set-production-designer · payK · 75 → 75 · OOH Set and Exhibit Designers $75,240 — подтверждено
- wedding-planner · payK · 75 → 61 · OOH Meeting, Convention, and Event Planners $61,160
- speech-public-speaking-coach · payK · 75 → 47 · OOH Self-Enrichment Teachers $46,800
- instructional-designer · payK · 75 → 77 · OOH Instructional Coordinators $77,440
- lighting-designer · payK · 75 → 75 · ближайшая профессия OOH — Set and Exhibit Designers $75,240 — подтверждено как ближайший ряд
- mri-technologist · payK · 75 → 95 · OOH Radiologic and MRI Technologists $95,480
- nutrition-coach-dietitian · payK · 75 → 76 · OOH Dietitians and Nutritionists $76,400
- chiropractor · payK · 75 → 79 · OOH Chiropractors $79,200
- appliance-repair-tech · payK · 75 → 51 · BLS EP Table 1.2, SOC 49-9031 Home Appliance Repairers $50,990
- home-inspector · payK · 75 → 75 · OOH Construction and Building Inspectors $74,690 — подтверждено
- garage-door-tech · payK · 75 → 50 · OOH General Maintenance and Repair Workers $49,590
- arborist-tree-pro · payK · 75 → 51 · BLS EP Table 1.2, SOC 37-3013 Tree Trimmers and Pruners $50,960 (собственный SOC профессии)
- handyman-solo-pro · payK · 75 → 50 · OOH General Maintenance and Repair Workers $49,590
- boat-mechanic-marine-tech · payK · 75 → 58 · OOH Small Engine Mechanics $57,550
- ev-charging-technician · payK · 75 → 63 · OOH Electricians (SOC профессии 47-2111) $63,190
- fiber-optic-technician · payK · 75 → 74 · OOH Telecommunications Technicians / EP SOC 49-9052 $74,330
- boilermaker · payK · 75 → 76 · OOH Boilermakers $76,410
- drone-pilot-commercial · payK · 75 → 123 · OOH/EP Commercial Pilots, SOC 53-2012 $123,220 (следует собственному SOC профессии в базе)
- boat-captain · payK · 75 → 92 · OOH Water Transportation Workers / EP SOC 53-5021 $92,460
- dog-trainer · payK · 75 → 40 · OOH Animal Trainers / EP SOC 39-2011 $39,990
- winemaker-enologist · payK · 75 → 82 · ближайшая профессия OOH — Agricultural and Food Scientists $81,970

## D5/D3 — движок был старее своих карт (карты уже несли BLS-2025)

- accountant · payK · 120 → 84 · BLS EP SOC 13-2011 $83,680; карта уже показывала $84K
- graphic-designer · payK · 45 → 63 · BLS EP SOC 27-1024 $62,960; карта уже показывала $63K
- software-developer · payK · 125 → 136 · BLS EP SOC 15-1252 $135,980; карта уже показывала $136K

## D4/D7 — сроки обучения (дефолт 3,5 мес → исследованные диапазоны)

Источник: BLS OOH, раздел "How to Become One" каждой профессии (прочитано
28.10.2026). Правка вносится в текст собственной карты профессии (движок
читает срок из карты), поэтому движок и витрина совпадают по построению.
Формат: было "1–6 months" (середина 3,5), если не указано иное.

- no-code-developer → "6–12 months" (портфолио-путь, OOH Web Developers)
- motion-designer-3d-artist → "2–4 years" (bachelor's + портфолио)
- game-designer → "2–4 years" (было "6–12 months")
- seo-specialist, ppc-paid-ads-specialist, brand-strategist → "2–4 years" (bachelor's, Market Research Analysts)
- content-strategist → "2–4 years"; copywriter → "2–4 years"; e-commerce-manager → "2–4 years"
- pr-specialist → "2–4 years" (было "6–12 months"); set-production-designer → "2–4 years" (было "6–12 months")
- voice-actor → "3–6 months" (классы + демо-рил)
- wedding-planner → "2–4 years"; event-planner → "2–4 years" (одна профессия OOH — Event Planners, bachelor's; оба исследователя дали bachelor's, диапазон выровнен по конвенции базы для bachelor's = 2–4 года)
- speech-public-speaking-coach → "6–12 months"
- home-inspector → "6–12 months"; garage-door-tech → "3–6 months"; handyman-solo-pro → "3–6 months"
- boat-mechanic-marine-tech → "3–6 months" (было "6–12 months"); appliance-repair-tech → "3–6 months"
- ev-charging-technician → "4–5 years" (было "6–12 months"; электрики — apprenticeship, OOH Electricians)
- fiber-optic-technician → "6–12 months"; drone-pilot-commercial → "6–12 months" (FAA commercial certificate)
- boat-captain → "1–2 years" (было "6–12 months"; USCG + sea time); dog-trainer → "3–6 months"
- web-designer → "6–12 months"; video-editor → "2–4 years"; smm-manager → "2–4 years"; podcast-producer → "2–4 years"
- mortgage-broker → "2–4 years"; b2b-sales-rep → "6–12 months"; recruiter → "2–4 years"; grant-writer → "2–4 years"
- phlebotomist → "3–6 months" (сертификат < 1 года); sterile-processing-tech → "6–12 months"
- drywall-finisher → "6–12 months"; tile-setter → "2–4 years" (apprenticeship); solar-installer → "6–12 months"
- flooring-installer → "2–4 years"; concrete-finisher → "2–4 years" (apprenticeship 3–4 года)
- cabinet-maker → "6–12 months"; furniture-restorer → "6–12 months"
- photographer → "6–12 months"; wedding-photographer → "6–12 months"; videographer → "2–4 years"; illustrator → "6–12 months"
- animator → "2–4 years" (та же страница OOH, что у motion-designer — диапазон выровнен)
- makeup-artist → "3–6 months"; nail-technician → "3–6 months"; lash-brow-artist → "3–6 months"; permanent-makeup-artist → "3–6 months" (программы эстетиста + лицензия)
- jewelry-maker → "1–2 years" (OJT ≥ года); butcher → "1–2 years"
- wellness-coach → "2–4 years"; chef → "2–4 years"; private-chef → "2–4 years"; baker → "6–12 months"
- restaurant-manager → "2–4 years"; farmers-market-producer → "2–4 years"; property-manager → "2–4 years"; executive-assistant → "2–4 years"
- private-tutor-in-person → "6–12 months"; dance-instructor → "2–4 years"; sports-coach → "2–4 years"
- cdl-truck-driver → "3–6 months" (CDL-школа); tow-truck-operator → "3–6 months"
- doula → "3–6 months" (DONA International: воркшоп + 3 оценённых родов)

Через TRAINING_OVERRIDES (карт нет или срок наследован — см. D10):
instructional-designer 36 → 54 (master's — типичный вход, OOH);
boilermaker 36 → 54 (apprenticeship ~4 года, OOH);
commercial-diver 3,5 → 9 (программы дайв-школ ~6–12 мес, программа 28 недель);
choreographer 3,5 → 54 (годы формальной подготовки + опыт танцора, OOH).

Подтверждены как верные (исследованы, оставлены "1–6 months"): online-tutor,
virtual-assistant, insurance-agent, real-estate-agent, home-health-aide,
house-painter, roofer, landscaper-lawn-pro, pool-technician, florist,
arborist-tree-pro, fitness-trainer, yoga-pilates-instructor,
barista-craft-coffee, chocolatier-candy-maker, aba-therapist-kids (RBT:
40 часов + экзамен), nanny-family-assistant-pro, elder-care-companion-pro,
flight-attendant, dispatcher-trucking, medical-courier-owner-route,
window-cleaning-owner, insurance-claims-adjuster, administrative-assistant,
vending-atm-route-owner, semiconductor-technician, tower-climber-telecom,
bus-driver, veterinary-assistant, coffee-roaster, community-health-worker,
delivery-driver-light-truck, hazardous-materials-removal-worker
(HAZWOPER 40 часов), reflexologist (ARCB 200 часов), salesforce-administrator
(сертификация Trailhead), subway-streetcar-operator, freight-broker-agent
(FMCSA: обучения не требуется), home-stager (сертификационный путь именно
стейджинга; зарплата при этом взята из SOC 27-1025).

## D10 — наследование (дочерние профессии получают собственные цифры)

- registered-nurse-2 (CRNA) · payK · 214 → 237 · BLS EP SOC 29-1151 Nurse Anesthetists $236,590. Раньше профессия ехала на карте Registered Nurse (slug-коллизия в матчинге карт).
- registered-nurse-2 (CRNA) · training_months · 36 (унаследовано от карты RN) → 36, но теперь собственное значение: TRAINING_OVERRIDES в professions.mjs; основание — BLS OOH: лицензия RN + ≥1 год опыта в critical care, затем программа nurse anesthesia (~36 мес). Флаг данных сменился на training_months_from_override.
- registered-nurse-2 (CRNA) · outlook · не было → "Growing · +10% to 2035 (BLS)" · EP SOC 29-1151 +9.7%
- tattoo-artist-2 (Paramedical Tattoo Artist) · training_months · 36 (унаследовано от карты Tattoo Artist) → 12 · редакторская оценка (ряда BLS нет): опытный тату-мастер + сертификационные курсы парамедицинской татуировки. TRAINING_OVERRIDES.

## D6 — фантастические цифры → здравые редакторские значения

Редакторские значения (ряда BLS для этих ролей не существует); сроки —
через текст собственных карт, чтобы движок и витрина совпадали.

- real-estate-investor-flips · payK · 150 → 85; training · карта "1–6 months" → "6–12 months"
- real-estate-investor-rentals · payK · 130 → 70; training · карта "1–6 months" → "6–12 months"
- self-storage-owner · payK · 130 → 85; training · карта "1–6 months" → "6–12 months"
- owner-operator-trucking · payK · 120 → 75 (якорь — медиана BLS Heavy Truck Drivers $58,640, EP SOC 53-3032, плюс премия владельца); training · карта "1–6 months" → "3–6 months"
- commercial-pilot · payK · 160 → 123 · BLS EP SOC 53-2012 $123,220

## D2 — outlook (BLS Employment Projections 2025–35, Table 1.2)

Заполняется полем `bls_outlook` через карту SOURCED_OUTLOOK в
api/_lib/engine/professions.mjs по коду SOC профессии. Формат строки —
как у существующих записей: "Growing · +N% to 2035 (BLS)" /
"Shrinking · −N% to 2035 (BLS)" / "Flat · 0% to 2035 (BLS)".

Итог: outlook был у 7 профессий, стало у **308 из 374** (добавлено 301:
300 по коду SOC + 1 ручной кроссволк substance-abuse-counselor O*NET
21-1011 → строка EP 21-1018). Распределение новых: Growing 255,
Shrinking 32, Flat 13. Комбинированные строки BLS использованы для:
lab-technician и histotechnologist (29-2010), home-health-aide,
elder-care-companion-pro и senior-home-care-agency-owner (31-1120),
real-estate-appraiser (13-2020). Без outlook остались 66: 65 профессий
без SOC в базе + special-education-teacher (O*NET 25-2056 — у BLS нет
единой детальной строки, есть только разбивка по уровням школы).
Существующие 7 ручных записей сохранены без изменений; все семь
совпали с округлением EP (проверено).

## D5 — синхронизация roadmap-карт с базой движка

Все 23 расхождения из аудита закрыты, плюс все карты профессий, тронутых
этим проходом. Механизм: цифра "~$NK" в денежной строке карты приведена
к payK движка (кроме трёх случаев из секции «движок был старее карт»,
где наоборот — движок приведён к карте/BLS). Синхронизировано строк
карт: 49 (48 скриптом + electrician 63 → 62 вручную: файл data-3 пишется
другим генератором, с пробелом после ключа). Финальная проверка после
всех правок: расхождений карта↔движок — 0.

## Не подтверждено / оставлено как редакторские оценки

Зарплаты $75K, оставленные сознательно (owner/creator/бизнес-роли, ряда
BLS не существует) — 29: online-course-creator, streamer-content-creator,
beauty-salon-owner, spa-owner, meal-prep-business-owner, life-coach,
personal-fashion-stylist, moving-company-owner, auto-detailing-mobile-owner,
cleaning-company-owner, handyman-company-owner, painting-company-owner,
lawn-care-company-owner, pressure-washing-owner, junk-removal-owner,
airbnb-co-host-str-manager, laundromat-owner, pet-grooming-salon-owner,
pet-boarding-daycare-owner, mobile-pet-groomer, mobile-mechanic-owner,
tutoring-center-owner, photo-booth-event-rentals-owner,
resale-flipping-business, amazon-fba-seller, boat-restoration-flipping,
car-flipping, franchise-owner-home-services, car-wash-owner,
gym-fitness-studio-owner (+ scalp-micropigmentation-artist — ниши без
ряда BLS; итого редакторских/нишевых на $75K — 30).

Не подтверждено источником (цифры НЕ менялись):
- customer-success-manager · payK 75 и срок 3,5 — ряда BLS нет; ближайшая
  профессия OOH (Customer Service Representatives, $44,770) — младшая
  роль, подставлять её как медиану CSM было бы ложной точностью.
- voice-actor · payK 75 — у актёров нет годовой медианы BLS (только
  почасовая $28.05 у Actors); срок при этом исправлен на "3–6 months".
- Сроки без авторитетного источника (остались 3,5): ugc-creator,
  dj-event-host, home-organizer-pro, etsy-digital-products-seller,
  print-on-demand-seller, food-stylist, vertical-farm-technician,
  scalp-micropigmentation-artist (срок).
- outlook не заполнен у 66 профессий (нет SOC или нет строки EP).

Сознательно НЕ тронуты: yacht-broker ($150K) и luxury-real-estate-agent
($140K) — комиссионные редакторские роли из списка slow-money; аудит D6
их не называл. Отдельная пометка: drone-pilot-commercial получил медиану
своего SOC в базе (53-2012 Commercial Pilots, $123K) — для дрон-работ
это верхняя граница рынка; маппинг SOC — прежнее ревьюенное решение
базы, в этом проходе не пересматривался.

---

## Поправка 28.10.2026 (вечер) — drone-pilot-commercial: медиана операторов дронов вместо медианы SOC

Файл перенесён в репозиторий (источник правды по режиму брифа 28.10);
запись выше — проход дня. Эта поправка отменяет одну строку того прохода:
`drone-pilot-commercial · payK · 75 → 123` (D3).

- drone-pilot-commercial · payK · 123 → 75 · медиана операторов коммерческих дронов по отраслевым источникам (см. ниже). 123 — медиана унаследованного SOC 53-2012 Commercial Pilots (OOH/EP $123,220): верх рынка пилотируемой авиации, а не операторов дронов. Отдельного ряда BLS (OOH/OEWS) для операторов дронов не существует — Salario methodology note, прочитано 28.10.2026: «no defensible BLS occupation crosswalk».
- drone-pilot-commercial · карточка (roadmaps-data-1.json) · "~$123K (BLS OOH ranges)" → "~$75K (industry salary data — BLS publishes no drone-operator series)". PDF роадмапа уже печатал ~$75K — после поправки движок, карточка и PDF согласованы (D5 = 0 расхождений). pay_top_decile_k у профессии не стоял (null) — исправлять нечего, выдуманная дециль не добавлялась.

Источники по зарплатам операторов дронов в США (все прочитаны 28.10.2026) —
разброс центральных оценок $57.5K–$131K, цифра спорная, фиксируем честно:
- Indeed (среднее, через гайд UAV Coach): $57,526.
- UAV Coach, гайд по зарплатам: mid-career ≈ $57K, experienced $88K+, фриланс $40–75K.
- Salario: национальная медиана $72,000 (оценка, не BLS).
- Rotate (синтез медиан агрегаторов): Indeed $76,500 · ZipRecruiter $79,196 · Glassdoor $82,000; сводная медиана ≈ $79K.
- Dronesgator (синтез): реалистичная середина для наёмных операторов на фултайме — $57–75K.
- ZipRecruiter (среднее по вакансиям) $130,916 и Glassdoor (среднее) $130,986 сами гайды помечают как перекошенные оборонными/корпоративными вакансиями и total compensation — это потолок, а не типичная медиана оператора.

Медиана медиан операторских источников (72 / 76.5 / 79.2 / 82) ≈ $78K.
Взято 75: внутри всех операторских синтезов, совпадает с цифрой, уже
напечатанной в PDF роадмапа профессии, и было собственной редакторской
цифрой базы до наследования SOC в проходе D3.

---

## Поправка 28.10.2026 — luxury-real-estate-agent: подкатегория вместо профессии входа (строка снята из базы)

Указание Маши: «агент по элитной недвижимости» — подкатегория риелтора,
с нуля им стать нельзя; Сваха не должна предлагать её как профессию входа.
Ошибка того же класса, что drone-pilot $123K: неверная строка тянула
ранжирование (на продовом гейте попытки A с конгруэнтностью эта строка
дала 19% сессий).

Что было не так:
- luxury-real-estate-agent · verdict YES · payK 140 · training 9 мес.
  Собственный O*NET-профиль строки — token_match на SOC 41-9022.00 Real
  Estate Sales Agents: буквально профиль ОБЫЧНОГО агента по продажам
  недвижимости (тот же SOC, что у строки real-estate-agent в этой же базе).
- $140K — редакторский PAYK-оверрайд в build_test.py без источника BLS;
  проход по данным 28.10 строку сознательно не тронул («Сознательно НЕ
  тронуты: yacht-broker ($150K) и luxury-real-estate-agent»). Обычная
  профессия того же SOC в базе: real-estate-agent, verdict NO, $53K
  (BLS OOH ranges — цифра её собственной карточки).
- age_gate у строки стоял null: несовершеннолетним (гейт, random #24,
  17 лет) профессия предлагалась.

Что сделано (путь «обычный риелтор в базе есть»):
- Строка снята из движковой базы полностью: кортеж удалён из
  professions.json, карточка и byName удалены из roadmaps-data-1.json,
  кортеж и PAYK-оверрайд удалены из build_test.py (папка сайта), чтобы
  пакетные сборки +30 не воскресили строку. База: 374 → 373 профессии.
- Luxury сохранён как ступень роста: в карточку real-estate-agent
  (roadmaps-data-2.json) добавлена строка: «Luxury segment: not an entry
  point — a specialization agents grow into after years of experience
  and a built client base.»
- Синхронность D5: движок = карточка = professions-base.json; регенерация
  экспорта дала ровно одно удаление и ноль прочих изменений.
- Оставлены на месте как сироты (не удалены, решения — за Машей): запись
  O*NET-импорта под слагом (тот же профиль 41-9022, без кортежа профессии
  не порождает), хранимый день плейграунда в playground-days-07.json,
  PDF роадмапа CareerGlitch_LuxuryRealEstateAgent_Roadmap_2027_v1.pdf
  (карточки на него больше нет — файл ни на что не ссылается).
