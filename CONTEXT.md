# Tips Beauty

Online cosmetics store for the Sudanese market. A customer Storefront and a separate Admin Portal share one Supabase backend.

## Language

### Apps

**Storefront**:
The customer-facing shopping app: a mobile-first web app that is also shipped to app stores inside a native wrapper.
_Avoid_: main site, frontend, website

**Admin Portal**:
The staff-only app for managing products, orders, promotions and drivers. Hosted separately from the Storefront.
_Avoid_: dashboard, backoffice

### Catalogue

**Product**:
A cosmetics item offered for sale. May have Variants and an origin (imported or local).

**Variant**:
A purchasable option of a Product (e.g. shade, size) with its own price and stock.
_Avoid_: option, SKU

**Review**:
A customer's rating and comment on a Product. Only a customer with a delivered Order containing that Product may write one, and only one per Product.
_Avoid_: comment, feedback, rating (a rating is part of a Review)

### Ordering

**Order**:
A customer's confirmed request to buy a set of Products, delivered to an address in a Sudanese State. Its total is computed by the backend, never trusted from the Storefront.
_Avoid_: purchase, transaction, cart (a Cart is not yet an Order)

**Cart**:
The customer's not-yet-ordered selection of Products, kept on their device.
_Avoid_: basket

**Order Status**:
The lifecycle stage of an Order: new → confirmed → preparing → shipped → delivered, or cancelled.

**Payment Method**:
How the customer pays: Cash on Delivery or Mycashi. Both are settled manually — staff mark the Order paid in the Admin Portal; there is no payment gateway integration.
_Avoid_: Fawry (not available in Sudan)

**Cash on Delivery (COD)**:
The customer pays the Driver in cash when the Order is delivered. Nothing is required at checkout.

**Mycashi**:
A Sudanese mobile-money transfer. The customer must enter the transfer Reference Number and upload a Payment Proof at checkout; staff verify both before confirming the Order.

**Reference Number**:
The identifier of a Mycashi transfer, entered by the customer at checkout.
_Avoid_: transaction ID, receipt number

**Payment Proof**:
The screenshot of a Mycashi transfer uploaded by the customer at checkout. Visible only to the customer who uploaded it and to staff.
_Avoid_: receipt, screenshot, attachment

**Payment Status**:
Whether staff have recorded the Order as paid.

**Discount**:
A percentage reduction on a single Product's price, set by staff. The only pricing rule at launch.
_Avoid_: offer, coupon

**Promotion** (post-launch):
A scheduled percentage or fixed-amount reduction applying to all Products, a Category, or chosen Products. When a Product's Discount and a Promotion both apply, the larger one wins; they never stack. No coupon codes.
_Avoid_: campaign, deal, sale

**Banner** (post-launch):
A staff-managed image with title, link and schedule shown on the Storefront home page. Has no effect on prices.
_Avoid_: marketing campaign, promotion, ad

### Stock

**Stock**:
The quantity of a Product or Variant available to sell, maintained by staff. Reserved atomically by the backend when an Order is created and restored when the Order is cancelled.
_Avoid_: inventory, quantity on hand

**Order Expiry**:
The automatic cancellation of an Order that stays `new` for 48 hours, releasing its Stock.
_Avoid_: timeout, abandoned order

### Notifications

**Order Confirmation**:
The Arabic email sent to the customer when their Order is created.

**New-Order Alert**:
The Arabic email sent to staff when an Order is created, linking to the Order in the Admin Portal.

**Unseen Order**:
A `new` Order no staff member has opened yet in the Admin Portal.
_Avoid_: unread, pending (pending is a Payment concept)

### Delivery

**Driver**:
A Tips Beauty employee who delivers Orders. Delivery is always by own Drivers, never a third-party courier.
_Avoid_: courier, delivery partner

**State**:
One of the Sudanese states an Order can be delivered to. All states are served.
_Avoid_: region, province, city (a city is within a State)

**Locality**:
A delivery area within a State (e.g. Omdurman within Khartoum State), maintained by staff with its own Shipping Fee.
_Avoid_: city, district, zone, area

**Shipping Fee**:
The delivery charge for an Order, determined by the Locality, or by the State's default fee when no Locality is chosen.
_Avoid_: delivery cost, flat rate

### Money

**SDG**:
Sudanese pound, the only currency used. Displayed as ج.س.
