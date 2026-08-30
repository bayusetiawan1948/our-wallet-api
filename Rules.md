# Coding & Module Architecture Rules

## 1. General Principles

Project menggunakan **Feature/Module-Based Architecture** dengan pendekatan **pragmatic testable architecture**.

Prioritas utama dalam setiap keputusan teknis:

> **Correctness → Maintainability → Consistency → Brevity**

Rules dalam dokumen ini merupakan **project convention** yang melengkapi baseline framework dan language convention.

Jangan memaksakan suatu rule apabila hasilnya membuat:

- struktur kode menjadi lebih buruk;
- abstraction menjadi tidak diperlukan;
- code menjadi lebih sulit dipahami;
- maintainability menurun;
- testing menjadi lebih sulit.

> **Prefer simple code until complexity justifies abstraction.**

---

# 2. Naming Convention

Naming harus konsisten dan dapat menunjukkan jenis serta scope dari suatu identifier.

## 2.1 File Naming

Semua nama file menggunakan **kebab-case**.

### Preferred

```text
users.controller.ts
users.service.ts
users.repository.ts
users.model.ts
users.service.spec.ts
inventory-calculator.ts
create-order.dto.ts
```

### Avoid

```text
UsersController.ts
usersController.ts
users_controller.ts
Users_Service.ts
```

Jika menggunakan pola `<module>.<responsibility>.<extension>`, bagian nama tetap menggunakan lowercase dan separator yang konsisten.

Contoh:

```text
inventory.service.ts
inventory.repository.ts
inventory.service.spec.ts
```

---

## 2.2 Class Naming

Semua class menggunakan **PascalCase**.

```ts
class UsersService {}

class InventoryRepository {}

class CreateOrderDto {}
```

---

## 2.3 Function Naming

### Public Function

Public function menggunakan **PascalCase**.

```ts
class UsersService {
  public CreateUser() {}

  public FindById() {}
}
```

### Private Function

Private function menggunakan **camelCase**.

```ts
class UsersService {
  public CreateUser() {
    return this.validateUser();
  }

  private validateUser() {}
}
```

> Public dan private function sengaja memiliki convention berbeda untuk membedakan public capability dengan internal implementation.

---

## 2.4 Variable Naming

Variable menggunakan **camelCase**.

```ts
const userId = 'user-1';
const inventoryItem = {};
const totalAmount = 100000;
```

### Avoid

```ts
const user_id = 'user-1';
const UserId = 'user-1';
const USER_ID = 'user-1';
```

---

## 2.5 Constant Naming

Constant menggunakan **UPPERCASE** dengan underscore sebagai separator.

```ts
const MAX_RETRY = 3;
const DEFAULT_PAGE_SIZE = 20;
const INVENTORY_STATUS_ACTIVE = 'ACTIVE';
```

Constant digunakan untuk value yang memiliki semantic meaning dan digunakan sebagai constant.

---

## 2.6 API Response Naming

Format response API bersifat standar dan paten (lihat detail di [Section 30](#30-standard-api-response--response-codes-rc)):

```json
{
  "rc": "00",
  "message": "Success",
  "data": {
    "user_id": "user-1",
    "created_at": "2026-08-27T00:00:00Z",
    "total_amount": 100000
  }
}
```

Field pada payload `data` API response menggunakan **snake_case**.

Internal TypeScript variable tetap menggunakan `camelCase`.

```ts
const userId = user.id;
const createdAt = user.createdAt;
const totalAmount = order.totalAmount;
```

Mapping ke `snake_case` dilakukan pada transport/serialization boundary.

---

## 2.7 Environment Variable Naming

Semua environment variable menggunakan **UPPERCASE_SNAKE_CASE**.

```text
DATABASE_URL
REDIS_HOST
REDIS_PORT
JWT_SECRET
APP_ENV
APP_PORT
```

Environment variable tidak menggunakan camelCase atau kebab-case.

---

# 3. Blank Line Rules

Gunakan blank line untuk memisahkan control-flow construct dari statement lain ketika construct tersebut berada di luar bloknya.

Rule ini berlaku untuk:

- `if`
- `else`
- `foreach`
- `for`
- `while`
- `switch`
- dan control-flow construct sejenis.

### Preferred

```ts
public ProcessOrder() {
    const order = this.GetOrder();

    if (order.isActive()) {
        this.Process(order);
    }

    this.Save(order);
}
```

Terdapat blank line antara:

```text
statement
↓
control flow
↓
statement
```

### Multiple control flow

```ts
public ProcessOrder() {
    const order = this.GetOrder();

    if (!order) {
        return;
    }

    if (!order.isActive()) {
        return;
    }

    this.Process(order);
}
```

### Tidak perlu blank line karena `{` atau `}`

Jangan menambahkan blank line hanya karena masuk atau keluar dari sebuah block.

```ts
if (order.isActive()) {
  this.Process(order);
}
```

Bukan:

```ts
if (order.isActive()) {
  this.Process(order);
}
```

### Function declaration

Jika statement sebelumnya adalah function declaration, blank line tambahan sebelum control flow tidak diperlukan hanya untuk memenuhi rule ini.

```ts
public ProcessOrder() {
    if (!this.IsValid()) {
        return;
    }

    this.Process();
}
```

Formatting baseline tetap mengikuti convention language/framework yang digunakan.

---

# 4. Magic Number & Magic String

Jangan menggunakan **magic number** atau **magic string** ketika literal tersebut memiliki semantic meaning.

### Avoid

```ts
if (retryCount >= 3) {
  throw new Error('Retry limit exceeded');
}
```

Jika `3` dan message tersebut merupakan business/technical rule, gunakan abstraction yang sesuai.

### Preferred

```ts
const MAX_RETRY = 3;
const RETRY_LIMIT_EXCEEDED = 'Retry limit exceeded';

if (retryCount >= MAX_RETRY) {
  throw new Error(RETRY_LIMIT_EXCEEDED);
}
```

Gunakan salah satu abstraction yang sesuai:

- constant;
- enum;
- configuration;
- environment variable;
- dedicated abstraction.

Literal yang benar-benar trivial tetap diperbolehkan.

Contoh:

```ts
const items = data.slice(0, 10);
```

Angka `0` dalam konteks tersebut tidak otomatis merupakan magic number.

> Jangan mengubah setiap literal menjadi constant secara mekanis. Yang diperhatikan adalah **semantic meaning**.

---

# 5. Function Extraction & Reuse

Logic yang digunakan di **lebih dari 2 file pada level yang sama** harus dipertimbangkan untuk diekstrak menjadi abstraction yang sesuai.

Contoh:

```text
Controller A
Controller B
Controller C
        ↓
Shared Service / Action / Utility
```

### Rules

- Dipakai di 1 module → tetap berada di module tersebut.
- Dipakai di 2 file → belum wajib diekstrak.
- Dipakai di lebih dari 2 file pada level yang sama → pertimbangkan extraction.
- Dipakai lintas layer → tentukan abstraction berdasarkan responsibility.

Jangan memindahkan function ke `shared` hanya karena function tersebut terlihat generic.

---

# 6. Comment Rules

Comment digunakan untuk menjelaskan **alasan**, bukan mengulang apa yang dilakukan kode.

### Avoid

```ts
// Get user by ID
const user = await this.GetUserById(userId);
```

Code sudah menjelaskan behavior tersebut.

### Preferred

```ts
// User must be loaded before inventory validation because
// inactive users cannot perform inventory operations.
const user = await this.GetUserById(userId);
```

Comment diperbolehkan untuk menjelaskan:

- technical decision;
- business decision;
- business rule;
- alasan implementation dibuat demikian;
- workaround terhadap limitation tertentu;
- logic yang memang sulit atau tidak obvious;
- shared/reusable logic yang memiliki constraint khusus.

> Comment harus menjawab **"why?"**, bukan **"what?"**.

---

# 7. Module Architecture

Project menggunakan **Feature/Module-Based Architecture**.

Struktur aplikasi mengikuti **business capability**, bukan technical layer.

```text
src/

├── modules/
│   ├── users/
│   ├── products/
│   ├── inventory/
│   └── sales/
│
├── shared/
├── database/
├── config/
├── app.module.ts
└── main.ts
```

### Rules

- Setiap business capability dapat memiliki module sendiri.
- Module menjadi boundary untuk business logic dan implementation detail.
- Jangan membuat folder global seperti:

```text
controllers/
services/
repositories/
models/
```

untuk seluruh aplikasi.

- Struktur module mengikuti kebutuhan nyata.
- Jangan memaksakan semua module memiliki file yang sama.

---

# 8. Module Structure

Struktur dasar module dapat berupa:

```text
orders/

├── orders.module.ts
├── orders.controller.ts
├── orders.service.ts
├── orders.repository.ts
├── orders.model.ts
└── orders.service.spec.ts
```

Tidak semua file wajib ada.

### Simple Module

```text
health/

└── health.controller.ts
```

### Module dengan Business Logic

```text
users/

├── users.module.ts
├── users.controller.ts
├── users.service.ts
└── users.service.spec.ts
```

### Module dengan Persistence

```text
products/

├── products.module.ts
├── products.controller.ts
├── products.service.ts
├── products.repository.ts
├── products.model.ts
└── products.service.spec.ts
```

> **Do not create a file merely to satisfy the architecture.**

Jika module tidak membutuhkan repository, jangan membuat repository kosong.

Jika module tidak membutuhkan model khusus, jangan membuat `*.model.ts`.

---

# 9. Module Boundary

Setiap module dianggap sebagai **independent business boundary**.

Contoh:

```text
modules/

├── users/
├── products/
├── inventory/
└── sales/
```

Setiap module memiliki ownership terhadap business logic-nya masing-masing.

```text
users     → user logic
products  → product logic
inventory → inventory logic
sales     → sales logic
```

### Rules

- Module tidak boleh mengakses implementation detail module lain secara langsung.
- Inter-module communication dilakukan melalui public capability/service.
- Repository module harus tetap internal terhadap module tersebut.
- ORM model module tidak boleh menjadi dependency langsung module lain.

### Forbidden

```ts
import { UsersRepository } from '../users/users.repository';
```

### Preferred

```text
SalesService
    ↓
UsersService
    ↓
UsersRepository
```

`SalesService` tidak perlu mengetahui bagaimana `UsersService` mengambil data.

---

# 10. Controller Rules

Controller bertanggung jawab terhadap **transport layer**, khususnya HTTP.

## Controller boleh

- menerima request;
- membaca params;
- membaca query;
- membaca body;
- melakukan request validation;
- memanggil service;
- mengembalikan response.

## Controller tidak boleh

- melakukan business logic;
- melakukan query database;
- mengakses repository secara langsung;
- mengakses ORM secara langsung;
- melakukan complex domain calculation;
- mengatur database transaction secara sembarangan.

### Dependency Flow

```text
HTTP Request
     ↓
Controller
     ↓
Service
     ↓
Repository
     ↓
Database
```

Controller harus **thin**.

### Preferred

```ts
@Post()
Create(@Body() dto: CreateOrderDto) {
    return this.ordersService.Create(dto);
}
```

### Forbidden

```ts
@Post()
async Create(@Body() dto: CreateOrderDto) {
    const product = await this.prisma.product.findUnique(...);

    if (!product) {
        throw new NotFoundException();
    }

    if (product.stock < dto.quantity) {
        throw new BadRequestException();
    }

    // ...
}
```

Business logic tersebut harus berada pada service/domain logic.

---

# 11. Service Rules

Service merupakan tempat utama untuk **business/use-case logic** dalam architecture pragmatis ini.

Contoh:

```text
OrdersService

├── Create()
├── Cancel()
├── Complete()
├── FindById()
└── List()
```

Service bertanggung jawab untuk:

- menjalankan business operation;
- melakukan business validation;
- mengorkestrasi repository;
- mengorkestrasi service module lain;
- menentukan flow suatu operation.

### Rules

- Service tidak boleh mengakses database/ORM secara langsung.
- Service menggunakan repository untuk persistence.
- Service boleh menggunakan service dari module lain.
- Business logic harus dapat dijalankan tanpa real database agar mudah di-unit-test.
- Hindari God Service.
- Pecahkan responsibility ketika complexity sudah meningkat.

### Forbidden

```ts
@Injectable()
export class OrdersService {
    constructor(
        private readonly prisma: PrismaService,
    ) {}

    async Create() {
        return this.prisma.order.create(...);
    }
}
```

### Preferred

```ts
@Injectable()
export class OrdersService {
    constructor(
        private readonly ordersRepository: OrdersRepository,
    ) {}

    async Create(dto: CreateOrderDto) {
        // business logic

        return this.ordersRepository.Create(...);
    }
}
```

---

# 12. Repository Rules

Repository bertanggung jawab terhadap **persistence**.

```text
Service
   ↓
Repository
   ↓
ORM
   ↓
Database
```

Repository boleh menangani:

- query;
- insert;
- update;
- delete;
- transaction;
- persistence mapping.

Repository tidak boleh menangani:

- HTTP;
- request/response;
- business workflow;
- controller concern.

### Forbidden

```ts
class OrdersRepository {
  CreateOrder() {
    // business logic
  }
}
```

### Preferred

```ts
class OrdersRepository {
  Create(data: CreateOrderData) {
    return this.prisma.order.create({
      data,
    });
  }
}
```

Repository berfokus pada:

> **How data is persisted.**

Service berfokus pada:

> **Why and when a business operation is allowed.**

---

# 13. Model Rules

`*.model.ts` bersifat **optional**.

Model dibuat ketika module membutuhkan representasi data yang memiliki architectural/domain value.

### Model dapat digunakan untuk

- domain representation;
- module-specific data structure;
- internal input/output structure;
- type yang sengaja dipisahkan dari ORM;
- value yang memiliki business meaning.

### Jangan membuat model hanya karena

> "Semua module harus memiliki model."

Jika ORM sudah menyediakan type yang memadai dan tidak membutuhkan abstraction tambahan, gunakan type tersebut.

### Avoid unnecessary abstraction

```text
Prisma User
    ↓
UserModel
    ↓
UserEntity
    ↓
UserDTO
```

Jika seluruh layer tersebut memiliki struktur yang sama dan tidak memberikan value tambahan, jangan membuat semuanya.

---

# 14. Dependency Rules

Dependency utama mengikuti arah:

```text
Controller
    ↓
Service
    ↓
Repository
    ↓
Persistence
```

### Allowed

```text
Controller → Service

Service → Repository
Service → Model
Service → Shared

Repository → Persistence
Repository → Model
Repository → Shared

Service → Other Module Service
```

### Forbidden

```text
Controller → Repository
Controller → Database
Controller → ORM

Service → Database
Service → ORM

Repository → Controller
Repository → Service

Module A → Module B Repository
Module A → Module B ORM Model
```

### Core Principle

> **Higher-level business logic must not bypass the abstraction below it.**

### Preferred

```text
SalesService
    ↓
InventoryService
    ↓
InventoryRepository
    ↓
Database
```

### Forbidden

```text
SalesService
    ↓
InventoryRepository
    ↓
Database
```

---

# 15. Inter-Module Communication

Module boleh memiliki dependency terhadap module lain apabila business operation memang membutuhkannya.

Contoh:

```text
Sales

├── Users
├── Products
└── Inventory
```

Dependency harus melalui public capability/service module tersebut.

### Preferred

```ts
@Injectable()
export class SalesService {
  constructor(
    private readonly usersService: UsersService,
    private readonly productsService: ProductsService,
    private readonly inventoryService: InventoryService,
    private readonly salesRepository: SalesRepository,
  ) {}
}
```

### Forbidden

```ts
@Injectable()
export class SalesService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly inventoryRepository: InventoryRepository,
  ) {}
}
```

Tujuannya agar setiap module tetap memiliki ownership terhadap business logic dan persistence-nya sendiri.

---

# 16. DTO Rules

DTO digunakan sebagai **transport/input/output contract**.

Contoh:

```text
orders/

├── orders.controller.ts
├── orders.service.ts
├── orders.repository.ts
├── orders.model.ts
└── dto/

    ├── create-order.dto.ts
    └── update-order.dto.ts
```

DTO boleh berisi:

- validation;
- serialization metadata;
- request structure;
- response structure.

DTO tidak boleh berisi:

- database query;
- business workflow;
- complex business calculation.

### DTO Property Naming Convention

- Property pada **DTO request body & query params** menggunakan **`snake_case`** (contoh: `owner_type`, `owner_id`, `initial_balance`).
- Hal ini selaras dengan payload data API response yang menggunakan `snake_case` (lihat Section 2.6).
- Mapping dari `snake_case` DTO ke internal entity/service variable (`camelCase`) dilakukan pada service layer/repository mapper.

> **DTO adalah contract, bukan business logic.**


---

# 17. Testable Architecture

Target utama testability:

> **Business logic dapat diuji tanpa real database, network, atau external service.**

Dependency:

```text
             ┌──────────────┐
             │ OrdersService│
             └───────┬──────┘
                     │
                     ↓
             ┌──────────────┐
             │  Repository  │
             └──────────────┘
                     ↑
                     │
                 Mock/Fake
                     │
                     ↓
                   Test
```

Service harus dapat diuji menggunakan mock/fake repository.

### Example

```ts
describe('OrdersService', () => {
  let service: OrdersService;
  let repository: Mocked<OrdersRepository>;

  beforeEach(() => {
    repository = {
      Create: vi.fn(),
      FindById: vi.fn(),
    } as unknown as Mocked<OrdersRepository>;

    service = new OrdersService(repository);
  });

  it('should create an order', async () => {
    repository.Create.mockResolvedValue({
      id: 'order-1',
      status: 'PENDING',
    });

    const result = await service.Create({
      customerId: 'user-1',
      items: [],
    });

    expect(repository.Create).toHaveBeenCalled();
    expect(result.id).toBe('order-1');
  });
});
```

Service test tidak membutuhkan real database.

---

# 18. Testing Strategy

Tidak semua file harus memiliki unit test.

Prioritas unit testing:

```text
Business Logic
      ↓
Service
      ↓
Complex Model/Helper
```

Repository lebih cocok menggunakan integration test apabila behavior-nya berkaitan erat dengan ORM/database.

```text
Repository
    ↓
ORM
    ↓
Real/Test Database
```

### Rules

- Business logic harus memiliki test.
- Service menjadi fokus utama unit testing.
- Unit test service tidak boleh membutuhkan real database.
- Repository CRUD sederhana tidak wajib memiliki unit test jika sudah tercakup integration test.
- Controller sederhana tidak perlu dipaksakan memiliki unit test jika behavior-nya tercakup integration/E2E test.
- Test harus menguji **behavior**, bukan implementation detail.
- Jangan membuat test hanya untuk meningkatkan coverage percentage.

---

# 19. Test File Location

Test sebaiknya berada dekat dengan source yang diuji.

### Simple Module

```text
orders/

├── orders.module.ts
├── orders.controller.ts
├── orders.service.ts
├── orders.service.spec.ts
├── orders.repository.ts
└── orders.model.ts
```

Jika module menjadi kompleks:

```text
orders/

├── orders.module.ts
├── orders.controller.ts
├── orders.service.ts
├── orders.repository.ts
├── orders.model.ts
└── tests/

    ├── orders.service.spec.ts
    ├── orders.repository.spec.ts
    └── orders.controller.spec.ts
```

Gunakan struktur paling sederhana yang masih maintainable.

---

# 20. Shared Rules

Struktur shared dapat berupa:

```text
shared/

├── errors/
├── types/
├── utils/
└── constants/
```

`shared` hanya berisi sesuatu yang benar-benar **cross-module**.

### Rules

- Code yang hanya digunakan satu module harus berada di module tersebut.
- Jangan memindahkan code ke `shared` hanya karena terlihat generic.
- `shared` tidak boleh menjadi dumping ground.
- `shared` tidak boleh bergantung pada business module tertentu.

### Bad

```text
shared/

├── order-helper.ts
├── inventory-helper.ts
├── user-helper.ts
└── payment-helper.ts
```

### Good

```text
modules/

├── orders/
│   └── orders.helper.ts
│
├── inventory/
│   └── inventory.helper.ts
│
└── users/

shared/

├── errors/
├── types/
└── utils/
```

Rule praktis:

> Jika hanya satu module yang membutuhkan code tersebut, code tersebut bukan shared code.

---

# 21. Database Rules

Database infrastructure berada di luar business module.

```text
src/

├── database/
│   ├── prisma.service.ts
│   └── ...
│
└── modules/
    ├── users/
    ├── orders/
    └── inventory/
```

Module tidak boleh membuat koneksi database sendiri.

### Forbidden

```ts
new PrismaClient();
```

di dalam:

```text
modules/orders/
modules/users/
modules/inventory/
```

Database connection harus dikelola secara application-wide melalui infrastructure/database layer.

---

# 22. Complexity-Based Structure

Architecture harus berkembang mengikuti complexity module.

## Small

```text
health/

└── health.controller.ts
```

## Medium

```text
users/

├── users.module.ts
├── users.controller.ts
├── users.service.ts
├── users.repository.ts
└── users.service.spec.ts
```

## Complex

```text
inventory/

├── inventory.module.ts
├── inventory.controller.ts
├── inventory.service.ts
├── inventory.repository.ts
├── inventory.model.ts
├── inventory.calculator.ts
├── inventory.validator.ts
├── inventory.service.spec.ts
├── inventory.calculator.spec.ts
└── inventory.validator.spec.ts
```

### Rule

> **Do not introduce architectural abstraction before complexity justifies it.**

Jangan membuat:

```text
domain/
application/
infrastructure/
ports/
adapters/
use-cases/
entities/
value-objects/
mappers/
```

hanya karena architecture pattern menyediakannya.

Abstraction harus muncul ketika abstraction tersebut menyelesaikan masalah nyata.

---

# 23. God Service Rule

Service tidak boleh menjadi tempat semua logic hanya karena service merupakan business layer.

### Warning Sign

```text
OrdersService

├── Create()
├── Cancel()
├── CalculateTax()
├── CalculateDiscount()
├── CalculateCOGS()
├── ValidateInventory()
├── ReserveInventory()
├── GenerateInvoice()
├── SendEmail()
└── SendNotification()
```

Jika complexity meningkat, pecahkan berdasarkan responsibility:

```text
orders/

├── orders.service.ts
├── orders.calculator.ts
├── orders.validator.ts
├── orders.repository.ts
└── ...
```

Pertimbangkan pemisahan ketika:

- logic memiliki responsibility berbeda;
- logic digunakan kembali;
- logic sulit di-test;
- logic memiliki business concept sendiri;
- service mulai sulit dipahami;
- service sulit dipelihara.

Jangan memecah method hanya karena method tersebut panjang.

---

# 24. Additional Naming Rules

Nama file dan class harus menjelaskan module serta responsibility.

### Preferred

```text
users.controller.ts
users.service.ts
users.repository.ts
users.model.ts
users.module.ts
users.service.spec.ts

inventory.calculator.ts
inventory.validator.ts
inventory.mapper.ts
```

### Avoid Generic Names

```text
helper.ts
common.ts
manager.ts
handler.ts
processor.ts
util.ts
service2.ts
```

Gunakan nama yang menunjukkan responsibility sebenarnya.

Contoh:

```text
inventory.calculator.ts
```

lebih jelas daripada:

```text
inventory.helper.ts
```

---

# 25. Import Rules

Import antar-module harus menggunakan public API module, bukan internal implementation.

### Forbidden

```ts
import { UsersRepository } from '@/modules/users/users.repository';
```

### Preferred

```ts
import { UsersService } from '@/modules/users/users.service';
```

Jika module memiliki banyak public capability, dapat digunakan public API:

```text
users/

├── users.module.ts
├── users.service.ts
├── users.repository.ts
└── index.ts
```

Kemudian:

```ts
import { UsersService } from '@/modules/users';
```

Gunakan barrel hanya apabila memang meningkatkan public API boundary.

Jangan membuat `index.ts` di setiap folder secara otomatis.

---

# 26. Reference Architecture

Untuk project **Bun + TypeScript + NestJS**, reference structure:

```text
src/
├── common/
│   ├── constants/
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   ├── middlewares/
│   ├── pipes/
│   ├── types/
│   └── utils/
│
├── modules/
│   ├── auth/
│   ├── households/
│   ├── users/
│   ├── wallets/
│   ├── categories/
│   ├── transactions/
│   ├── transfers/
│   ├── debts/
│   ├── investments/
│   ├── budgets/
│   ├── goals/
│   └── audit-logs/
│
├── shared/
│   └── database/
│       ├── schema/
│       ├── database.module.ts
│       └── database.provider.ts
│
├── app.module.ts
└── main.ts
```

---

# 27. Core Dependency Graph

```text
                         ┌───────────────┐
                         │   Controller  │
                         └───────┬───────┘
                                 │
                                 ↓
                         ┌───────────────┐
                         │    Service    │
                         └───────┬───────┘
                                 │
                    ┌────────────┴────────────┐
                    ↓                         ↓
             ┌───────────────┐       ┌───────────────┐
             │   Repository  │       │ Other Service │
             └───────┬───────┘       └───────────────┘
                     │
                     ↓
             ┌───────────────┐
             │   Database    │
             └───────────────┘
```

Inter-module dependency:

```text
SalesService
    ↓
InventoryService
    ↓
InventoryRepository
    ↓
Database
```

---

# 28. Core Principles

Semua implementation harus mengikuti prinsip berikut:

1. **Keep modules independent.**
2. **Keep controllers thin.**
3. **Keep business logic inside services or appropriate domain abstractions.**
4. **Keep persistence behind repositories.**
5. **Keep business logic testable without real infrastructure.**
6. **Do not bypass module boundaries.**
7. **Do not create abstractions without a real problem to solve.**
8. **Do not create files merely to satisfy an architectural pattern.**
9. **Prefer explicit responsibility over generic helper/utility naming.**
10. **Prefer behavior-focused tests over coverage-focused tests.**
11. **Use shared code only when it is genuinely cross-module.**
12. **Use naming conventions consistently across the project.**

> **Correctness first, maintainability second, consistency third, brevity last.**

---

# 29. Rule Addition Policy

Rules baru tidak boleh ditambahkan secara diam-diam ke convention ini.

Jika ditemukan rule tambahan yang berpotensi meningkatkan:

- maintainability;
- readability;
- consistency;
- testability;
- security;
- performance;
- architecture quality;

maka rule tersebut harus disampaikan terlebih dahulu sebagai:

> **Saran Rule Tambahan**

Rule baru hanya menjadi bagian dari convention setelah disetujui.

---

# 30. Standard API Response & Response Codes (RC)

Setiap response API **wajib** mengembalikan format response standar yang paten:

```json
{
  "rc": "00",
  "message": "string",
  "data": {}
}
```

### Response Contract

- **`rc`**: Enum Response Code (string 2-digit) yang merepresentasikan status operasional bisnis atau teknis.
- **`message`**: Human-readable deskripsi status/error.
- **`data`**: Payload response berbentuk `object` atau `array`. Untuk response error atau endpoint tanpa payload data, berisi object kosong `{}` atau `null`. Seluruh keys di dalam `data` wajib mengikuti format `snake_case` (lihat Section 2.6).

### Response Code (RC) Definition

```ts
export const RC = {
  SUCCESS: '00',
  FORMAT_ERROR: '05',
  PRODUCT_INVALID: '13',
  USER_NOT_FOUND: '14',
  NOT_FOUND: '14',
  GENERAL_ERROR: '30',
  INSUFFICIENT_BALANCE: '51',
  WRONG_PASSWORD: '55',
  SECURITY_ERROR: '63',
  NETWORK_ERROR: '89',
  DATABASE_ERROR: '91',
  DUPLICATE: '94',
} as const;

export type RCCode = (typeof RC)[keyof typeof RC];
```

### HTTP Status Mapping & Helper

Mapping antara Response Code (`RC`) dan HTTP Status Code:

```ts
export const RC_HTTP_STATUS: Record<RCCode, number> = {
  [RC.SUCCESS]: 200,
  [RC.FORMAT_ERROR]: 400,
  [RC.PRODUCT_INVALID]: 422,
  [RC.USER_NOT_FOUND]: 404, // same as RC.NOT_FOUND
  [RC.GENERAL_ERROR]: 500,
  [RC.INSUFFICIENT_BALANCE]: 422,
  [RC.WRONG_PASSWORD]: 401,
  [RC.SECURITY_ERROR]: 403,
  [RC.NETWORK_ERROR]: 400,
  [RC.DATABASE_ERROR]: 503,
  [RC.DUPLICATE]: 409,
};

export function getHttpStatus(rc: string): number {
  return RC_HTTP_STATUS[rc as RCCode] ?? 500;
}
```

### RC Reference Table

| RC   | Enum Key                       | HTTP Status                 | Keterangan                                               |
| ---- | ------------------------------ | --------------------------- | -------------------------------------------------------- |
| `00` | `SUCCESS`                      | `200 OK`                    | Operasi berhasil dieksekusi                              |
| `05` | `FORMAT_ERROR`                 | `400 Bad Request`           | Format input/payload tidak valid atau gagal validasi DTO |
| `13` | `PRODUCT_INVALID`              | `422 Unprocessable Entity`  | Produk / item transaksi tidak valid atau tidak ditemukan |
| `14` | `USER_NOT_FOUND` / `NOT_FOUND` | `404 Not Found`             | Entitas user atau resource tidak ditemukan               |
| `30` | `GENERAL_ERROR`                | `500 Internal Server Error` | Kesalahan umum internal server                           |
| `51` | `INSUFFICIENT_BALANCE`         | `422 Unprocessable Entity`  | Saldo dompet tidak mencukupi untuk transaksi             |
| `55` | `WRONG_PASSWORD`               | `401 Unauthorized`          | Password / kredensial otentikasi salah                   |
| `63` | `SECURITY_ERROR`               | `403 Forbidden`             | Akses ditolak / pelanggaran keamanan / forbidden         |
| `89` | `NETWORK_ERROR`                | `400 Bad Request`           | Kesalahan komunikasi jaringan / gateway eksternal        |
| `91` | `DATABASE_ERROR`               | `503 Service Unavailable`   | Gangguan atau kesalahan query database                   |
| `94` | `DUPLICATE`                    | `409 Conflict`              | Data duplikat / konflik unik (e.g. data sudah terdaftar) |
# 31. Internal Type Contract Rules (Anti Duck-Typing)

Untuk data yang **sumbernya dikontrol sendiri** (return value dari service/controller/repository internal), **dilarang** melakukan runtime shape-detection menggunakan `in` operator, `typeof` berlapis, atau optional chaining fallback untuk menentukan struktur object.

> **Jika bentuk data ditentukan oleh kontrak TypeScript sendiri, gunakan compile-time type, bukan runtime detection.**

## 31.1 Kapan Duck-Typing Dilarang

Duck-typing/runtime shape-check **dilarang** ketika:

- `result` berasal dari service/controller/repository di dalam codebase sendiri;
- shape sudah bisa dijamin lewat return type function (interface/type);
- kebutuhan sebenarnya adalah "memenuhi Section 30 (Standard API Response)", bukan validasi data dari sumber tidak terpercaya.

### Forbidden

```ts
if (
  result !== null &&
  typeof result === 'object' &&
  !Array.isArray(result) &&
  ('data' in result || 'message' in result || 'rc' in result)
) {
  const resObj = result as Record<string, unknown>;

  if (typeof resObj.message === 'string') {
    finalMessage = resObj.message;
  }

  if (
    typeof resObj.rc === 'string' &&
    Object.values(ResponseCode).includes(resObj.rc as ResponseCode)
  ) {
    finalRC = resObj.rc as ResponseCode;
  }

  finalData = 'data' in resObj ? (resObj.data ?? null) : null;
}
```

Masalah pada pola ini:

- Duck-typing terhadap tipe yang seharusnya sudah dikontrak lewat interface sendiri.
- Silent fallback (`?? null`, default value tanpa else/log) menyembunyikan bug — typo field atau service yang tidak mematuhi kontrak jadi tidak ketahuan sampai production.
- Validasi (`Object.values(...).includes(...)`) dilakukan tanpa tindakan (tidak throw, tidak log) — checking for the sake of checking.

### Preferred

Definisikan kontrak eksplisit, lalu gunakan **type guard function** bernama jelas — bukan inline `in` checks bertumpuk:

```ts
interface ServiceResponseWrapper<T = unknown> {
  rc?: ResponseCode;
  message?: string;
  data?: T;
}

function isServiceResponseWrapper(
  value: unknown,
): value is ServiceResponseWrapper {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}
```

Jika seluruh service di dalam module **wajib** mengembalikan shape ini, kontrak harus dipaksakan di **compile-time** (return type function, base class, atau generic constraint), bukan dicek ulang di runtime pada setiap interceptor/consumer:

```ts
abstract class BaseService<T> {
  abstract Execute(...args: unknown[]): Promise<ServiceResponseWrapper<T>>;
}
```

## 31.2 Kapan Runtime Validation Diperbolehkan

Runtime shape validation **hanya** dibenarkan ketika data benar-benar berasal dari sumber **untrusted**:

- response dari external API/third-party;
- payload dari message queue/webhook;
- input yang belum divalidasi DTO (request body/query — tetap gunakan `class-validator` DTO, bukan manual `in` checks);
- data dari file/parsing eksternal.

Untuk kasus ini, tetap gunakan type guard eksplisit yang diberi nama sesuai domainnya (`isExternalPaymentResponse`, bukan generic inline check), dan **wajib** ada penanganan eksplisit (throw/log) ketika shape tidak sesuai — jangan silent fallback ke default value.

### Preferred (untrusted source)

```ts
function isExternalPaymentResponse(
  value: unknown,
): value is ExternalPaymentResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return 'status' in value && 'reference_id' in value;
}

const raw = await externalGateway.charge(payload);

if (!isExternalPaymentResponse(raw)) {
  throw new BadGatewayException(RC.NETWORK_ERROR);
}
```

## 31.3 Core Principle

1. **Data dari internal source → percaya pada compile-time type, jangan re-validasi shape-nya di runtime.**
2. **Data dari external/untrusted source → gunakan named type guard, dan tindak lanjuti hasil invalid-nya secara eksplisit (throw/log), jangan silent fallback.**
3. **Jangan pernah membuat runtime check yang tidak diikuti tindakan** — jika hasil check invalid tidak menyebabkan apa pun (tidak throw, tidak log, tidak reject), check tersebut tidak punya fungsi selain menambah noise.
