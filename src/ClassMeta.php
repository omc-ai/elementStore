<?php
/**
 * ClassMeta - Class definition (schema)
 *
 * Defines a class with its properties, inheritance, and storage configuration.
 * Classes themselves are stored as objects in the @class class.
 *
 * Key concepts:
 * - extends_id: Parent class ID for inheritance (single string, not array)
 * - props: Array of property definitions (Prop objects or arrays)
 * - Inheritance chain is resolved by ClassModel.getClassProps()
 *
 * @package ElementStore
 */

namespace ElementStore;

/**
 * ClassMeta - Class definition (schema)
 */
class ClassMeta extends EntityObj
{
    /** @var string|null Description of the class */
    public ?string $description = null;

    /** @var string|null Parent class ID for inheritance */
    public ?string $extends_id = null;

    /** @var array Property definitions (Prop objects or arrays) */
    public array $props = [];

    /** @var string|null Custom table name (for SQL storage) */
    public ?string $table_name = null;

    /**
     * Create ClassMeta from array data
     *
     * @param string                       $class_id Class identifier (ignored, uses K_CLASS)
     * @param array                        $data     Class metadata
     * @param \Phalcon\Di\DiInterface|null $di       DI container
     *
     * @return static
     */
    public static function fromArray(string $class_id = '', array $data = [], ?\Phalcon\Di\DiInterface $di = null): static
    {
        return new static(Constants::K_CLASS, $data, $di);
    }

    /**
     * Create ClassMeta from data array (convenience method)
     *
     * @param array                        $data Class metadata
     * @param \Phalcon\Di\DiInterface|null $di   DI container
     *
     * @return static
     */
    public static function create(array $data, ?\Phalcon\Di\DiInterface $di = null): static
    {
        return new static(Constants::K_CLASS, $data, $di);
    }

    /**
     * Get a property definition by key
     *
     * @param string $key Property key
     *
     * @return Prop|null Property or null if not found
     */
    public function getProp(string $key): ?Prop
    {
        foreach ($this->props as $prop) {
            $propKey = $prop instanceof Prop ? $prop->key : ($prop['key'] ?? null);
            if ($propKey === $key) {
                return $prop instanceof Prop ? $prop : Prop::create($prop);
            }
        }
        return null;
    }

    /**
     * Get all properties as Prop objects
     *
     * Note: This returns only own properties, not inherited ones.
     * Use ClassModel::getClassProps() to get full inherited property chain.
     *
     * @return Prop[] Array of Prop objects
     */
    public function getProps(): array
    {
        return array_map(
            fn($p) => $p instanceof Prop ? $p : Prop::create($p),
            $this->props
        );
    }

    /**
     * Add a property to this class
     *
     * @param Prop|array $prop Property to add
     *
     * @return self
     */
    public function addProp(Prop|array $prop): self
    {
        $this->props[] = $prop;
        return $this;
    }

    /**
     * Remove a property by key
     *
     * @param string $key Property key to remove
     *
     * @return self
     */
    public function removeProp(string $key): self
    {
        $this->props = array_values(array_filter(
            $this->props,
            function ($p) use ($key) {
                $propKey = $p instanceof Prop ? $p->key : ($p['key'] ?? null);
                return $propKey !== $key;
            }
        ));
        return $this;
    }

    /**
     * Check if this class has a parent
     *
     * @return bool
     */
    public function hasParent(): bool
    {
        return $this->extends_id !== null;
    }

    /**
     * Check if this is a system class (starts with @)
     *
     * @return bool
     */
    public function isSystemClass(): bool
    {
        return str_starts_with($this->id ?? '', '@');
    }

    /**
     * Factory method to create object for this class
     *
     * @param array|null $data Object data
     *
     * @return AtomObj Created object
     */
    public function factoryObject(?array $data = []): AtomObj
    {
        $model = $this->getModel();
        if ($model) {
            return $model->factory($this->id, $data ?? []);
        }
        // Fallback if no model available
        return new AtomObj($this->id, $data ?? [], $this->getDi());
    }

    /**
     * Convert to array, including props as arrays
     *
     * @return array
     */
    public function toArray(): array
    {
        $array = parent::toArray();

        // Ensure props are arrays, not objects
        if (!empty($array['props'])) {
            $array['props'] = array_map(
                fn($p) => $p instanceof Prop ? $p->toArray() : $p,
                $array['props']
            );
        }

        return $array;
    }
}
